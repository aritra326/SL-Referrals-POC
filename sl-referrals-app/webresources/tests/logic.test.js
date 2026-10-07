/*
 * Tests for the rules and the Dataverse calls, using a pretend Xrm. Run:  node --test "sl-referrals-app/webresources/tests/*.test.js"
 * The web resource files are loaded exactly as a browser would load them (no changes needed for testing).
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const folder = path.join(__dirname, "..");

/** Loads the shared helpers and the named page scripts into a fresh pretend browser window. */
function load(pageFiles, xrm, search) {
    const sandbox = { console: console, URLSearchParams: URLSearchParams, Promise: Promise };
    sandbox.window = sandbox;
    sandbox.Xrm = xrm;
    sandbox.location = { search: search || "" };
    vm.createContext(sandbox);
    ["slcrm_common.js"].concat(pageFiles).forEach(function (file) {
        vm.runInContext(fs.readFileSync(path.join(folder, file), "utf8"), sandbox, { filename: file });
    });
    return sandbox.SLCRM;
}

/** A pretend Xrm that records what the page sends. `handlers` can override any call. */
function fakeXrm(handlers) {
    const calls = [];
    const h = handlers || {};
    return {
        calls: calls,
        Utility: { getGlobalContext: function () { return { userSettings: { userId: "{AAAA-BBBB}" } }; } },
        Navigation: { openForm: function () {}, navigateBack: function () {} },
        WebApi: {
            retrieveRecord: async function (table, id, options) { calls.push({ call: "retrieveRecord", table, id, options }); return h.retrieveRecord ? h.retrieveRecord(table, id, options) : {}; },
            retrieveMultipleRecords: async function (table, options) { calls.push({ call: "retrieveMultiple", table, options }); return { entities: h.retrieveMultiple ? h.retrieveMultiple(table, options) : [] }; },
            createRecord: async function (table, data) { calls.push({ call: "createRecord", table, data }); if (h.createRecord) { return h.createRecord(table, data, calls); } return { id: "{NEW-ID}" }; },
            online: {
                execute: async function (request) {
                    const description = request.getMetadata();
                    const parameters = {};
                    Object.keys(description.parameterTypes).forEach(function (name) { if (name !== "entity") { parameters[name] = request[name]; } });
                    calls.push({ call: "execute", operation: description.operationName, bound: request.entity, parameters, types: description.parameterTypes });
                    return h.execute ? h.execute(request) : { ok: true, status: 200, json: async function () { return {}; } };
                }
            }
        }
    };
}

// ------------------------------------------------------------------------------------------------------------------
// slcrm_common.js
// ------------------------------------------------------------------------------------------------------------------

test("cleanGuid removes braces and bindTo builds an @odata.bind value", function () {
    const common = load([]).common;
    assert.strictEqual(common.cleanGuid("{ABC-123}"), "ABC-123");
    assert.strictEqual(common.cleanGuid(undefined), "");
    assert.strictEqual(common.bindTo("accounts", "{ABC-123}"), "/accounts(ABC-123)");
});

test("getLaunchParam reads a normal query value and a value packed inside ?data=", function () {
    const direct = load([], null, "?recordId=111&entityName=x").common;
    assert.strictEqual(direct.getLaunchParam("recordId"), "111");

    const packed = load([], null, "?data=" + encodeURIComponent("recordId=222&entityName=opportunity")).common;
    assert.strictEqual(packed.getLaunchParam("recordId"), "222");
    assert.strictEqual(packed.getLaunchParam("entityName"), "opportunity");
    assert.strictEqual(packed.getLaunchParam("missing"), "");
});

test("parseServerMessage separates the SLR- code from the sentence", function () {
    const common = load([]).common;
    assert.deepEqual(common.parseServerMessage("SLR-STATUS-409: The item was already decided."),
        { code: "SLR-STATUS-409", message: "The item was already decided." });
    assert.deepEqual(common.parseServerMessage("CONFIG-RANK-001: Rank direction is not set."),
        { code: "CONFIG-RANK-001", message: "Rank direction is not set." });
    assert.deepEqual(common.parseServerMessage("Plain message"), { code: "", message: "Plain message" });
    assert.deepEqual(common.parseServerMessage(""), { code: "", message: "" });
});

test("describeError uses the fallback only when the error has no text", function () {
    const common = load([]).common;
    assert.deepEqual(common.describeError(new Error("SLR-AUTH-403: Not allowed"), "fallback"), { message: "Not allowed", code: "SLR-AUTH-403" });
    assert.deepEqual(common.describeError({}, "fallback"), { message: "fallback", code: "" });
});

test("friendlyError explains permission, duplicate and timeout errors, and hides hex error codes", function () {
    const common = load([]).common;
    assert.match(common.friendlyError(new Error("Principal user is missing prvCreateX privilege"), "fb").message, /permission/);
    assert.match(common.friendlyError(new Error("Duplicate record found"), "fb").message, /already exists/);
    assert.match(common.friendlyError(new Error("The operation timed out"), "fb").message, /timed out/);
    assert.strictEqual(common.friendlyError(new Error("0x80040265 Something internal"), "fb").message, "fb");
    assert.strictEqual(common.friendlyError(new Error("Reason must be chosen"), "fb").message, "Reason must be chosen");
    const original = new Error("boom");
    assert.strictEqual(common.friendlyError(original, "fb").originalError, original);
});

test("runBoundAction describes the call to Xrm.WebApi.online.execute and returns the response body", async function () {
    const xrm = fakeXrm({ execute: function () { return { ok: true, status: 200, json: async function () { return { ResultRecordId: "R1" }; } }; } });
    const common = load([], xrm).common;
    const result = await common.runBoundAction("slcrm_referralitem", "{ID-1}", "slcrm_Do", { ActionName: { type: "Edm.String", value: "Authorise" } });
    assert.strictEqual(result.ResultRecordId, "R1");
    const call = xrm.calls[0];
    assert.strictEqual(call.operation, "slcrm_Do");
    assert.strictEqual(call.bound.id, "ID-1");
    assert.strictEqual(call.bound.entityType, "slcrm_referralitem");
    assert.deepEqual(call.parameters, { ActionName: "Authorise" });
    assert.strictEqual(call.types.entity.typeName, "mscrm.slcrm_referralitem");
});

test("runBoundAction treats 204 as an empty result and a failed response as an error", async function () {
    const empty = fakeXrm({ execute: function () { return { ok: true, status: 204 }; } });
    assert.deepEqual(await load([], empty).common.runBoundAction("t", "1", "op", {}), {});

    const failed = fakeXrm({ execute: function () { return { ok: false, status: 500 }; } });
    await assert.rejects(load([], failed).common.runBoundAction("t", "1", "op", {}), /status 500/);
});

test("getXrm tells the user when the page is not inside the app", function () {
    assert.throws(function () { load([], null).common.getXrm(); }, /opened from inside/);
});

// ------------------------------------------------------------------------------------------------------------------
// Decision dialog
// ------------------------------------------------------------------------------------------------------------------

test("decision dialog: every action is complete and findable", function () {
    const dialog = load(["slcrm_referraldecision.js"]).DecisionDialog;
    assert.strictEqual(dialog.ACTIONS.length, 8);
    dialog.ACTIONS.forEach(function (action) {
        ["name", "target", "title", "commentLabel", "commentHint", "confirmLabel", "consequence"].forEach(function (key) {
            assert.ok(action[key], action.name + " has no " + key);
        });
        assert.ok(dialog.findAction(action.target, action.name));
    });
    assert.ok(dialog.findAction("slcrm_referralitem", "authorise"), "the action name is not case sensitive");
    assert.strictEqual(dialog.findAction("slcrm_referralrequest", "Authorise"), undefined, "Authorise is only for items");
    assert.strictEqual(dialog.findAction("slcrm_referralitem", "Nope"), undefined);
});

test("decision dialog: only Onward asks for an authority", function () {
    const dialog = load(["slcrm_referraldecision.js"]).DecisionDialog;
    const needing = dialog.ACTIONS.filter(function (a) { return a.requiresAuthority; }).map(function (a) { return a.name; });
    assert.deepEqual(needing, ["Onward"]);
});

test("decision dialog: comment and authority validation", function () {
    const dialog = load(["slcrm_referraldecision.js"]).DecisionDialog;
    const reject = dialog.findAction("slcrm_referralitem", "Reject");
    const authorise = dialog.findAction("slcrm_referralitem", "Authorise");
    const onward = dialog.findAction("slcrm_referralitem", "Onward");

    assert.match(dialog.validateComment(reject, "   "), /rejection reason/);
    assert.strictEqual(dialog.validateComment(reject, "Too risky"), null);
    assert.strictEqual(dialog.validateComment(authorise, ""), null, "Authorise does not need a comment");
    assert.match(dialog.validateAuthority(onward, ""), /Choose the authority/);
    assert.strictEqual(dialog.validateAuthority(onward, "id"), null);
    assert.strictEqual(dialog.validateAuthority(reject, ""), null);
});

test("decision dialog: runAction sends the right parameters and trims the comment", async function () {
    const xrm = fakeXrm();
    const dialog = load(["slcrm_referraldecision.js"], xrm).DecisionDialog;
    await dialog.runAction("slcrm_referralitem", "ID-1", "Onward", "  Needs higher limit  ", "{AUTH-1}");
    const call = xrm.calls[0];
    assert.strictEqual(call.operation, "slcrm_ExecuteReferralItemAction");
    assert.deepEqual(call.parameters, { ActionName: "Onward", Comment: "Needs higher limit", NewAuthorityId: "AUTH-1" });
    assert.strictEqual(call.types.NewAuthorityId.typeName, "Edm.Guid");

    await dialog.runAction("slcrm_referralrequest", "ID-2", "Cancel", "   ", "");
    assert.strictEqual(xrm.calls[1].operation, "slcrm_ExecuteReferralRequestAction");
    assert.deepEqual(xrm.calls[1].parameters, { ActionName: "Cancel" }, "an empty comment and no authority are left out");
});

test("decision dialog: loadContext reads the item number, its referral and the status text", async function () {
    const xrm = fakeXrm({
        retrieveRecord: function () {
            return { slcrm_referralitemnumber: "RFI-1", slcrm_Referral: { slcrm_name: "REF-9" }, "statuscode@OData.Community.Display.V1.FormattedValue": "Submitted" };
        }
    });
    const context = await load(["slcrm_referraldecision.js"], xrm).DecisionDialog.loadContext("slcrm_referralitem", "ID-1");
    assert.deepEqual(context, { heading: "RFI-1", subheading: "REF-9", status: "Submitted" });
});

test("decision dialog: loadEligibleAuthorities parses the server's JSON", async function () {
    const list = [{ id: "A", name: "Dana", rank: 5 }];
    const xrm = fakeXrm({ execute: function () { return { ok: true, status: 200, json: async function () { return { AuthoritiesJson: JSON.stringify(list) }; } }; } });
    const result = await load(["slcrm_referraldecision.js"], xrm).DecisionDialog.loadEligibleAuthorities("ID-1");
    assert.deepEqual(result, list);
    assert.strictEqual(xrm.calls[0].operation, "slcrm_GetEligibleAuthorities");

    const broken = fakeXrm({ execute: function () { return { ok: true, status: 200, json: async function () { return { AuthoritiesJson: "{not json" }; } }; } });
    await assert.rejects(load(["slcrm_referraldecision.js"], broken).DecisionDialog.loadEligibleAuthorities("ID-1"), /could not be read/);
});

// ------------------------------------------------------------------------------------------------------------------
// Copy Rationale
// ------------------------------------------------------------------------------------------------------------------

test("copy rationale: loadPolicyForOpportunity returns null when the opportunity has no policy", async function () {
    const xrm = fakeXrm({ retrieveRecord: function () { return {}; } });
    assert.strictEqual(await load(["slcrm_copyrationale.js"], xrm).CopyRationale.loadPolicyForOpportunity("OPP-1"), null);
});

test("copy rationale: loadPolicyForOpportunity returns the policy and customer", async function () {
    const xrm = fakeXrm({
        retrieveRecord: function (table) {
            if (table === "opportunity") { return { _slcrm_policy_value: "{POL-1}" }; }
            return { slcrm_policyid: "POL-1", slcrm_name: "POL-0001", _slcrm_customerinsured_value: "{ACC-1}", slcrm_CustomerInsured: { name: "Acme" } };
        }
    });
    const policy = await load(["slcrm_copyrationale.js"], xrm).CopyRationale.loadPolicyForOpportunity("OPP-1");
    assert.deepEqual(policy, { policyId: "POL-1", policyReference: "POL-0001", customerId: "ACC-1", customerName: "Acme" });
});

test("copy rationale: only Final rationales of the same policy are requested, newest year first", async function () {
    const xrm = fakeXrm({
        retrieveMultiple: function () {
            return [{ slcrm_rationalid: "R1", slcrm_name: "Rationale 2025", slcrm_renewalyear: 2025, slcrm_status: 100000001,
                modifiedon: "2026-01-01T00:00:00Z", slcrm_Underwriter: { fullname: "Dana Lee" }, slcrm_pricing: "Rate +5%" }];
        }
    });
    const page = load(["slcrm_copyrationale.js"], xrm).CopyRationale;
    const options = await page.loadCopyableRationales("{POL-1}", "{OPP-1}");

    const query = decodeURIComponent(xrm.calls[0].options);
    assert.match(query, /slcrm_Opportunity\/_slcrm_policy_value eq POL-1/);
    assert.match(query, /slcrm_status eq 100000001/);
    assert.match(query, /_slcrm_opportunity_value ne OPP-1/);
    assert.match(query, /\$orderby=slcrm_renewalyear desc/);

    assert.strictEqual(options.length, 1);
    assert.strictEqual(options[0].underwriterName, "Dana Lee");
    assert.strictEqual(options[0].statusLabel, "Final");
    assert.strictEqual(options[0].fields.slcrm_pricing, "Rate +5%");
    assert.strictEqual(options[0].fields.slcrm_claimsexperience, "", "columns with no value become empty text");
    assert.deepEqual(await page.loadCopyableRationales("", "OPP-1"), [], "no policy means nothing to copy");
});

test("copy rationale: createRationale makes a Draft and links it, and copies the text when given a source", async function () {
    const xrm = fakeXrm();
    const page = load(["slcrm_copyrationale.js"], xrm).CopyRationale;
    const policy = { policyId: "POL-1", policyReference: "POL-0001", customerId: "ACC-1", customerName: "Acme" };
    const source = { id: "SRC-1", renewalYear: 2024, fields: { slcrm_pricing: "Rate +5%", slcrm_claimsexperience: "" } };

    const id = await page.createRationale({ opportunityId: "OPP-1", policy, renewalYear: 2026, currentUserId: "USER-1", source });
    assert.strictEqual(id, "NEW-ID");

    const data = xrm.calls[0].data;
    assert.strictEqual(xrm.calls[0].table, "slcrm_rational");
    assert.strictEqual(data.slcrm_status, page.STATUS.draft);
    assert.strictEqual(data.slcrm_iscurrent, true);
    assert.strictEqual(data.slcrm_renewalyear, 2026);
    assert.strictEqual(data["slcrm_Opportunity@odata.bind"], "/opportunities(OPP-1)");
    assert.strictEqual(data["slcrm_Policy@odata.bind"], "/slcrm_policies(POL-1)");
    assert.strictEqual(data["slcrm_CustomerInsured@odata.bind"], "/accounts(ACC-1)");
    assert.strictEqual(data["slcrm_Underwriter@odata.bind"], "/systemusers(USER-1)");
    assert.strictEqual(data["slcrm_SourceRational@odata.bind"], "/slcrm_rationals(SRC-1)");
    assert.strictEqual(data["slcrm_CopiedBy@odata.bind"], "/systemusers(USER-1)");
    assert.strictEqual(data.slcrm_pricing, "Rate +5%");
    assert.ok(!("slcrm_claimsexperience" in data), "empty source fields are not copied");
    assert.match(data.slcrm_name, /2026 \(from 2024\)/);

    // Starting from scratch: no source, no copied text, no copy markers.
    await page.createRationale({ opportunityId: "OPP-1", policy, renewalYear: 2026, currentUserId: "USER-1" });
    const blank = xrm.calls[1].data;
    assert.ok(!("slcrm_SourceRational@odata.bind" in blank) && !("slcrm_copiedon" in blank) && !("slcrm_pricing" in blank));
});

test("copy rationale: a create failure becomes a friendly message", async function () {
    const xrm = fakeXrm({ createRecord: function () { throw new Error("Principal user is missing privilege prvCreateslcrm_rational"); } });
    const page = load(["slcrm_copyrationale.js"], xrm).CopyRationale;
    await assert.rejects(page.createRationale({ opportunityId: "O", policy: { policyId: "P", policyReference: "R" }, renewalYear: 2026, currentUserId: "U" }), /permission/);
});

// ------------------------------------------------------------------------------------------------------------------
// Referral Builder
// ------------------------------------------------------------------------------------------------------------------

function builder(xrm) {
    return load(["slcrm_referralbuilder.js"], xrm).ReferralBuilder;
}

/** A draft that passes validation. */
function validDraft(page) {
    const draft = page.emptyDraft();
    draft.opportunityId = "OPP-1";
    draft.productId = "PROD-1";
    draft.customerId = "ACC-1";
    draft.description = "Fleet renewal";
    Object.assign(draft.items[0], { referralReasonId: "RR-1", coverSectionId: "CV-1", rationale: "Limit exceeds authority", requiredAuthorityLevelId: "LV-1" });
    return draft;
}

test("builder: a blank draft has Medium priority, Annual policy type and one empty item", function () {
    const page = builder();
    const draft = page.emptyDraft();
    assert.strictEqual(draft.items.length, 1);
    assert.strictEqual(draft.priority, "633650001");
    assert.strictEqual(draft.policyType, "633650000");
    assert.notStrictEqual(page.newItem().clientKey, page.newItem().clientKey, "each item has its own key");
});

test("builder: validation lists every missing field", function () {
    const page = builder();
    const draft = page.emptyDraft();
    const errors = page.validateDraft(draft);
    assert.deepEqual(Object.keys(errors.context).sort(), ["description", "opportunityId", "productId"]);
    assert.deepEqual(Object.keys(errors.items[draft.items[0].clientKey]).sort(),
        ["coverSectionId", "rationale", "referralReasonId", "requiredAuthorityLevelId"]);
    const messages = page.buildErrorList(draft, errors);
    assert.strictEqual(messages.length, 7);
    assert.ok(messages.includes("Referral item 1: Underwriter rationale is required."), "item messages name the field");
});

test("builder: a complete draft is valid", function () {
    const page = builder();
    const draft = validDraft(page);
    assert.strictEqual(page.buildErrorList(draft, page.validateDraft(draft)).length, 0);
});

test("builder: whitespace-only text does not count", function () {
    const page = builder();
    const draft = validDraft(page);
    draft.description = "   ";
    draft.items[0].rationale = "  ";
    const errors = page.validateDraft(draft);
    assert.ok(errors.context.description && errors.items[draft.items[0].clientKey].rationale);
});

test("builder: the same reason and cover twice is reported on the second item only", function () {
    const page = builder();
    const draft = validDraft(page);
    const second = Object.assign(page.newItem(), draft.items[0], { clientKey: "second" });
    draft.items.push(second);
    const errors = page.validateDraft(draft);
    assert.ok(!errors.items[draft.items[0].clientKey], "the first item is fine");
    assert.match(errors.items.second.referralReasonId, /already on the referral/);
    assert.match(page.buildErrorList(draft, errors)[0], /^Referral item 2: This reason and cover combination/);
});

test("builder: covers are limited to the chosen product, and covers with no product apply to all", function () {
    const page = builder();
    const covers = [{ id: "c1", parentId: "P1" }, { id: "c2", parentId: "P2" }, { id: "c3" }];
    assert.deepEqual(page.getCoversForProduct(covers, "P1").map(function (c) { return c.id; }), ["c1", "c3"]);
    assert.deepEqual(page.getCoversForProduct(covers, ""), []);
});

test("builder: the summary shows the highest required level", function () {
    const page = builder();
    const levels = [{ id: "L1", label: "Level 1", rank: 1 }, { id: "L5", label: "Level 5", rank: 5 }];
    const draft = page.emptyDraft();
    assert.strictEqual(page.getHighestLevel(draft, levels), undefined);
    draft.items[0].requiredAuthorityLevelId = "L1";
    draft.items.push(Object.assign(page.newItem(), { requiredAuthorityLevelId: "L5" }));
    assert.strictEqual(page.getHighestLevel(draft, levels).label, "Level 5");
});

test("builder: the checklist ticks as the draft fills in", function () {
    const page = builder();
    const blank = page.buildChecklist(page.emptyDraft());
    assert.ok(blank.every(function (entry) { return !entry.ok; }));
    const full = page.buildChecklist(validDraft(page));
    assert.deepEqual(full.map(function (e) { return e.ok; }), [true, true, true, true, false], "approvers are optional so they stay unticked");
    assert.strictEqual(full[3].label, "All 1 item complete");
});

test("builder: eligible approvers are filtered by level rank", async function () {
    const xrm = fakeXrm({
        retrieveMultiple: function () {
            return [
                { slcrm_underwriterauthorityid: "A1", slcrm_name: "Dana - Hull", _slcrm_authoritylevel_value: "L5", _slcrm_underwriter_value: "{U-DANA}" },
                { slcrm_underwriterauthorityid: "A2", slcrm_name: "Sam - Hull", _slcrm_authoritylevel_value: "L2" },
                { slcrm_underwriterauthorityid: "A3", slcrm_name: "Unknown level", _slcrm_authoritylevel_value: "L9" }
            ];
        }
    });
    const levels = [{ id: "L5", label: "Level 5", rank: 5 }, { id: "L2", label: "Level 2", rank: 2 }];
    const list = await builder(xrm).loadEligibleAuthorities("{PROD-1}", 4, levels);
    assert.deepEqual(list.map(function (a) { return a.id; }), ["A1"]);
    assert.strictEqual(list[0].userId, "U-DANA", "the approver's user id is kept so it can become the Assigned Approver");

    const query = decodeURIComponent(xrm.calls[0].options);
    assert.match(query, /_slcrm_productclassofbusiness_value eq PROD-1/);
    assert.match(query, /statuscode eq 633650001/);
    assert.deepEqual(await builder(xrm).loadEligibleAuthorities("", 4, levels), [], "no product means no approvers");
});

test("builder: saveDraft creates the referral then one numbered item per row, as Draft, with numbers not text", async function () {
    const xrm = fakeXrm({
        createRecord: function (table, data, calls) { return { id: "{ID-" + calls.length + "}" }; },
        retrieveRecord: function () { return { slcrm_name: "REF-0042" }; }
    });
    const page = builder(xrm);
    const draft = validDraft(page);
    draft.countryId = "CTY-1";
    draft.inceptionDate = "2026-11-01";
    draft.items[0].underwriterAuthorityId = "UA-1";
    draft.items[0].assignedApproverId = "U-DANA";
    draft.items.push(Object.assign(page.newItem(), { referralReasonId: "RR-2", coverSectionId: "CV-2", rationale: "Second", requiredAuthorityLevelId: "LV-2" }));

    const result = await page.saveDraft(draft, "USER-1");
    assert.deepEqual(result, { referralRequestId: "ID-1", referralNumber: "REF-0042", itemCount: 2 });

    const creates = xrm.calls.filter(function (c) { return c.call === "createRecord"; });
    assert.deepEqual(creates.map(function (c) { return c.table; }), ["slcrm_referralrequest", "slcrm_referralitem", "slcrm_referralitem"]);

    const parent = creates[0].data;
    assert.strictEqual(parent.slcrm_priority, 633650001);
    assert.strictEqual(parent.slcrm_policytype, 633650000);
    assert.strictEqual(parent.statuscode, 633650001);
    assert.strictEqual(parent.slcrm_haseverbeensubmitted, false);
    assert.strictEqual(parent.slcrm_inceptioneffectivedate, "2026-11-01");
    assert.strictEqual(parent["slcrm_Opportunity@odata.bind"], "/opportunities(OPP-1)");
    assert.strictEqual(parent["slcrm_Product@odata.bind"], "/slcrm_products(PROD-1)");
    assert.strictEqual(parent["slcrm_CustomerInsured@odata.bind"], "/accounts(ACC-1)");
    assert.strictEqual(parent["slcrm_CountryofReferral@odata.bind"], "/slcrm_countries(CTY-1)");
    assert.strictEqual(parent["slcrm_PrimaryUnderwriter@odata.bind"], "/systemusers(USER-1)");

    const first = creates[1].data;
    assert.strictEqual(first.slcrm_logicalitemid, "ITEM-0001");
    assert.strictEqual(first.slcrm_sequence, 1);
    assert.strictEqual(first.statuscode, 633650001);
    assert.strictEqual(first["slcrm_Referral@odata.bind"], "/slcrm_referralrequests(ID-1)");
    assert.strictEqual(first["slcrm_UnderwriterAuthority@odata.bind"], "/slcrm_underwriterauthorities(UA-1)");
    assert.strictEqual(creates[2].data.slcrm_logicalitemid, "ITEM-0002");
    assert.strictEqual(first["slcrm_AssignedApprover@odata.bind"], "/systemusers(U-DANA)", "the chosen authority's user becomes the Assigned Approver");
    assert.ok(!("slcrm_UnderwriterAuthority@odata.bind" in creates[2].data), "no approver chosen, so no lookup is sent");
    assert.ok(!("slcrm_AssignedApprover@odata.bind" in creates[2].data), "no approver chosen, so no Assigned Approver is sent");
});

test("builder: if an item fails, the message says how many were saved", async function () {
    let created = 0;
    const xrm = fakeXrm({
        createRecord: function () {
            created++;
            if (created === 3) { throw new Error("Server said no"); }
            return { id: "{ID-" + created + "}" };
        }
    });
    const page = builder(xrm);
    const draft = validDraft(page);
    draft.items.push(Object.assign(page.newItem(), { referralReasonId: "RR-2", coverSectionId: "CV-2", rationale: "Second", requiredAuthorityLevelId: "LV-2" }));
    await assert.rejects(page.saveDraft(draft, "USER-1"), /saved with 1 of 2 items/);
});

test("builder: a referral number that cannot be read does not fail the save", async function () {
    const xrm = fakeXrm({ retrieveRecord: function () { throw new Error("no read access"); } });
    const page = builder(xrm);
    const result = await page.saveDraft(validDraft(page), "USER-1");
    assert.strictEqual(result.referralNumber, undefined);
    assert.strictEqual(result.itemCount, 1);
});
