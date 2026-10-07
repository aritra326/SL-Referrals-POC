/*
 * SL CRM - Referral Builder page (page: slcrm_referralbuilder.html)
 *
 * The "New Referral" screen. The underwriter fills in the shared context (opportunity, product ...), adds one or more
 * referral items (reason, cover, rationale, authority level, approver) and saves. Everything is saved as DRAFT.
 * Moving a draft to "Sent for Approval" is done later by the lifecycle Custom API on the server, which checks the
 * authority rules. This page never does that.
 *
 * Opened from the site map, or from an Opportunity with ?data=recordId=<opportunity id>&entityName=opportunity
 * (then the opportunity is pre-selected).
 *
 * HOW THE FILE IS ORGANISED
 *   1. SCHEMA          - every Dataverse name used here, in one place
 *   2. Loading data    - the lists for the drop-downs
 *   3. Saving          - creates the referral, then its items
 *   4. Rules           - validation and the small calculations, as plain functions (no screen code)
 *   5. The screen      - state + draw() + handlers
 */
var SLCRM = window.SLCRM || {};
window.SLCRM = SLCRM;

SLCRM.ReferralBuilder = (function () {
    "use strict";

    const common = SLCRM.common;
    const el = common.el;

    // ------------------------------------------------------------------------------------------------------------
    // 1. SCHEMA
    //
    // Three kinds of name appear below and they are NOT interchangeable:
    //   - table         the logical name, passed to Xrm.WebApi.createRecord / retrieveMultipleRecords
    //   - entitySet     the plural name that goes INSIDE an "@odata.bind" value, e.g. "/slcrm_products(guid)"
    //   - nav           the lookup's SchemaName (mixed case) that goes on the LEFT of an "@odata.bind".
    //                   Note the deliberate inconsistency: Referral Request uses "slcrm_CountryofReferral"
    //                   (lower case "of"), Referral Reason uses "slcrm_CountryOfReferral".
    // ------------------------------------------------------------------------------------------------------------
    const TABLES = {
        referralRequest: { table: "slcrm_referralrequest", entitySet: "slcrm_referralrequests" },
        referralItem: { table: "slcrm_referralitem", entitySet: "slcrm_referralitems" },
        referralReason: { table: "slcrm_referralreason", entitySet: "slcrm_referralreasons", id: "slcrm_referralreasonid" },
        coverSection: { table: "slcrm_coversection", entitySet: "slcrm_coversections", id: "slcrm_coversectionid" },
        authorityLevel: { table: "slcrm_authoritylevel", entitySet: "slcrm_authoritylevels", id: "slcrm_authoritylevelid" },
        underwriterAuthority: { table: "slcrm_underwriterauthority", entitySet: "slcrm_underwriterauthorities", id: "slcrm_underwriterauthorityid" },
        product: { table: "slcrm_product", entitySet: "slcrm_products", id: "slcrm_productid" },
        country: { table: "slcrm_country", entitySet: "slcrm_countries", id: "slcrm_countryid" },
        opportunity: { table: "opportunity", entitySet: "opportunities" },
        account: { table: "account", entitySet: "accounts" },
        systemUser: { table: "systemuser", entitySet: "systemusers" }
    };

    // Columns and lookups of the Referral Request (the parent).
    const REQUEST = {
        description: "slcrm_commonbusinessriskdescription",
        inceptionDate: "slcrm_inceptioneffectivedate",
        priority: "slcrm_priority",
        policyType: "slcrm_policytype",
        sourceSystem: "slcrm_sourcesystem",
        hasEverBeenSubmitted: "slcrm_haseverbeensubmitted",
        name: "slcrm_name", // the referral number, filled in by the server
        nav: {
            opportunity: "slcrm_Opportunity",
            product: "slcrm_Product",
            customer: "slcrm_CustomerInsured",
            broker: "slcrm_Broker",
            primaryUnderwriter: "slcrm_PrimaryUnderwriter",
            country: "slcrm_CountryofReferral"
        }
    };

    // Columns and lookups of the Referral Item (the child).
    const ITEM = {
        underwriterRationale: "slcrm_underwriterrationale",
        logicalItemId: "slcrm_logicalitemid",
        isCurrentRevision: "slcrm_iscurrentrevision",
        revisionNumber: "slcrm_revisionnumber",
        sequence: "slcrm_sequence",
        nav: {
            referral: "slcrm_Referral",
            coverSection: "slcrm_CoverSection",
            referralReason: "slcrm_ReferralReason",
            product: "slcrm_Product",
            requiredAuthorityLevel: "slcrm_RequiredAuthorityLevel",
            underwriterAuthority: "slcrm_UnderwriterAuthority",
            assignedApprover: "slcrm_AssignedApprover"
        }
    };

    // Choice values. They are specific to this environment's publisher (option prefix 63365).
    const STATUS = {
        referralRequestDraft: 633650001,
        referralItemDraft: 633650001,
        underwriterAuthorityCurrent: 633650001
    };
    const ACTIVE = 0; // statecode of an active record

    const PRIORITIES = [
        { id: "633650000", label: "High" },
        { id: "633650001", label: "Medium" },
        { id: "633650002", label: "Low" }
    ];
    const POLICY_TYPES = [
        { id: "633650000", label: "Annual" },
        { id: "633650001", label: "Project" },
        { id: "633650002", label: "LTA" }
    ];
    const SOURCE_SYSTEM_CRM = 633650000;

    // ------------------------------------------------------------------------------------------------------------
    // 2. Loading data for the drop-downs. Each function returns a list of { id, label, ... }.
    //    Every query uses $select so we only fetch the columns we show.
    // ------------------------------------------------------------------------------------------------------------

    async function getRows(table, query) {
        const result = await common.getXrm().WebApi.retrieveMultipleRecords(table, query);
        return result.entities;
    }

    async function loadProducts() {
        const rows = await getRows(TABLES.product.table,
            "?$select=slcrm_productid,slcrm_name&$filter=statecode eq " + ACTIVE + "&$orderby=slcrm_name asc");
        return rows.map(function (row) {
            return { id: row.slcrm_productid, label: row.slcrm_name || "(unnamed)" };
        });
    }

    async function loadReferralReasons() {
        const rows = await getRows(TABLES.referralReason.table,
            "?$select=slcrm_referralreasonid,slcrm_name,slcrm_displayorder" +
            "&$filter=statecode eq " + ACTIVE + "&$orderby=slcrm_displayorder asc,slcrm_name asc");
        return rows.map(function (row) {
            return { id: row.slcrm_referralreasonid, label: row.slcrm_name || "(unnamed)" };
        });
    }

    /** Cover sections carry the product they belong to (parentId) so the screen can filter them without another call. */
    async function loadCoverSections() {
        const rows = await getRows(TABLES.coverSection.table,
            "?$select=slcrm_coversectionid,slcrm_name,slcrm_covercode,_slcrm_product_value" +
            "&$filter=statecode eq " + ACTIVE + "&$orderby=slcrm_displayorder asc,slcrm_name asc");
        return rows.map(function (row) {
            return {
                id: row.slcrm_coversectionid,
                label: row.slcrm_name || "(unnamed)",
                parentId: common.cleanGuid(row._slcrm_product_value) || undefined
            };
        });
    }

    /** Only levels that can approve referrals are offered as a "required" level. rank is used to compare levels. */
    async function loadAuthorityLevels() {
        const rows = await getRows(TABLES.authorityLevel.table,
            "?$select=slcrm_authoritylevelid,slcrm_name,slcrm_comparisonrank,slcrm_canapprovereferrals" +
            "&$filter=statecode eq " + ACTIVE + " and slcrm_canapprovereferrals eq true" +
            "&$orderby=slcrm_comparisonrank asc");
        return rows.map(function (row) {
            return { id: row.slcrm_authoritylevelid, label: row.slcrm_name || "(unnamed)", rank: row.slcrm_comparisonrank };
        });
    }

    async function loadCountries() {
        const rows = await getRows(TABLES.country.table,
            "?$select=slcrm_countryid,slcrm_name&$filter=statecode eq " + ACTIVE + "&$orderby=slcrm_name asc");
        return rows.map(function (row) {
            return { id: row.slcrm_countryid, label: row.slcrm_name || "(unnamed)" };
        });
    }

    /** The first 50 active opportunities, by name. */
    async function loadOpportunities() {
        const rows = await getRows(TABLES.opportunity.table,
            "?$select=opportunityid,name&$top=50&$filter=statecode eq " + ACTIVE + "&$orderby=name asc");
        return rows.map(function (row) {
            return { id: row.opportunityid, label: row.name || "(untitled opportunity)" };
        });
    }

    /** Reads the customer (account) of an opportunity. Returns { opportunityId, customerId, customerName }. */
    async function loadOpportunityContext(opportunityId) {
        const row = await common.getXrm().WebApi.retrieveRecord(
            TABLES.opportunity.table,
            opportunityId,
            "?$select=opportunityid,name,_parentaccountid_value&$expand=parentaccountid($select=name)"
        );
        return {
            opportunityId: common.cleanGuid(opportunityId),
            customerId: common.cleanGuid(row._parentaccountid_value) || undefined,
            customerName: row.parentaccountid ? row.parentaccountid.name : ""
        };
    }

    /**
     * Approvers who could decide an item for this product at or above the required rank.
     * This only helps the user choose. The server checks eligibility again when the referral is submitted:
     * the authority must be Current, in date, for the right product and held by an enabled user.
     */
    async function loadEligibleAuthorities(productId, requiredRank, levels) {
        if (!productId) {
            return [];
        }
        const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd

        const rows = await getRows(TABLES.underwriterAuthority.table,
            "?$select=slcrm_underwriterauthorityid,slcrm_name,_slcrm_authoritylevel_value,_slcrm_underwriter_value" +
            "&$filter=statecode eq " + ACTIVE +
            " and statuscode eq " + STATUS.underwriterAuthorityCurrent +
            " and _slcrm_productclassofbusiness_value eq " + common.cleanGuid(productId) +
            " and (slcrm_effectivefrom eq null or slcrm_effectivefrom le " + today + ")" +
            " and (slcrm_effectiveto eq null or slcrm_effectiveto ge " + today + ")" +
            "&$orderby=slcrm_name asc");

        const approvers = [];
        rows.forEach(function (row) {
            const levelId = common.cleanGuid(row._slcrm_authoritylevel_value);
            const level = levels.find(function (candidate) { return candidate.id === levelId; });
            // Keep the authority only when its level is known and ranks high enough.
            if (level && (level.rank || 0) >= requiredRank) {
                approvers.push({
                    id: row.slcrm_underwriterauthorityid,
                    label: row.slcrm_name || "(unnamed)",
                    rank: level.rank,
                    userId: common.cleanGuid(row._slcrm_underwriter_value) // becomes the item's Assigned Approver
                });
            }
        });
        return approvers;
    }

    // ------------------------------------------------------------------------------------------------------------
    // 3. Saving
    // ------------------------------------------------------------------------------------------------------------

    /**
     * Saves the draft: first the Referral Request, then one Referral Item per row.
     * If an item fails after the request was created, the error says how many items were saved so the user does not
     * create a second referral for the same risk.
     * Returns { referralRequestId, referralNumber, itemCount }.
     */
    async function saveDraft(draft, currentUserId) {
        const referralRequestId = await createReferralRequest(draft, currentUserId);

        let created = 0;
        try {
            for (let i = 0; i < draft.items.length; i++) {
                await createReferralItem(draft, draft.items[i], referralRequestId, i + 1);
                created++;
            }
        } catch (error) {
            const friendly = common.friendlyError(error, "The referral was created but not all items could be added.");
            friendly.message = friendly.message +
                " The referral was saved with " + created + " of " + draft.items.length + " items. " +
                "Open it from Referrals to add the rest.";
            throw friendly;
        }

        return {
            referralRequestId: referralRequestId,
            referralNumber: await readReferralNumber(referralRequestId),
            itemCount: draft.items.length
        };
    }

    async function createReferralRequest(draft, currentUserId) {
        const data = {};
        data[REQUEST.description] = draft.description;
        data[REQUEST.priority] = Number(draft.priority); // the drop-down holds it as text
        data[REQUEST.policyType] = Number(draft.policyType);
        data[REQUEST.sourceSystem] = SOURCE_SYSTEM_CRM;
        data[REQUEST.hasEverBeenSubmitted] = false;
        data.statuscode = STATUS.referralRequestDraft;

        if (draft.inceptionDate) {
            data[REQUEST.inceptionDate] = draft.inceptionDate;
        }
        if (draft.opportunityId) {
            data[REQUEST.nav.opportunity + "@odata.bind"] = common.bindTo(TABLES.opportunity.entitySet, draft.opportunityId);
        }
        if (draft.productId) {
            data[REQUEST.nav.product + "@odata.bind"] = common.bindTo(TABLES.product.entitySet, draft.productId);
        }
        if (draft.customerId) {
            data[REQUEST.nav.customer + "@odata.bind"] = common.bindTo(TABLES.account.entitySet, draft.customerId);
        }
        if (draft.countryId) {
            data[REQUEST.nav.country + "@odata.bind"] = common.bindTo(TABLES.country.entitySet, draft.countryId);
        }
        if (currentUserId) {
            data[REQUEST.nav.primaryUnderwriter + "@odata.bind"] = common.bindTo(TABLES.systemUser.entitySet, currentUserId);
        }

        try {
            const created = await common.getXrm().WebApi.createRecord(TABLES.referralRequest.table, data);
            return common.cleanGuid(created.id);
        } catch (error) {
            throw common.friendlyError(error, "The referral could not be created.");
        }
    }

    async function createReferralItem(draft, item, referralRequestId, sequence) {
        const data = {};
        data[ITEM.underwriterRationale] = item.rationale;
        data[ITEM.logicalItemId] = "ITEM-" + String(sequence).padStart(4, "0");
        data[ITEM.isCurrentRevision] = true;
        data[ITEM.revisionNumber] = 1;
        data[ITEM.sequence] = sequence;
        data.statuscode = STATUS.referralItemDraft;
        data[ITEM.nav.referral + "@odata.bind"] = common.bindTo(TABLES.referralRequest.entitySet, referralRequestId);

        if (item.referralReasonId) {
            data[ITEM.nav.referralReason + "@odata.bind"] = common.bindTo(TABLES.referralReason.entitySet, item.referralReasonId);
        }
        if (item.coverSectionId) {
            data[ITEM.nav.coverSection + "@odata.bind"] = common.bindTo(TABLES.coverSection.entitySet, item.coverSectionId);
        }
        if (draft.productId) {
            data[ITEM.nav.product + "@odata.bind"] = common.bindTo(TABLES.product.entitySet, draft.productId);
        }
        if (item.requiredAuthorityLevelId) {
            data[ITEM.nav.requiredAuthorityLevel + "@odata.bind"] = common.bindTo(TABLES.authorityLevel.entitySet, item.requiredAuthorityLevelId);
        }
        if (item.underwriterAuthorityId) {
            data[ITEM.nav.underwriterAuthority + "@odata.bind"] = common.bindTo(TABLES.underwriterAuthority.entitySet, item.underwriterAuthorityId);
        }
        // The server only lets the Assigned Approver act on an item, so the chosen authority's underwriter is saved as well.
        if (item.assignedApproverId) {
            data[ITEM.nav.assignedApprover + "@odata.bind"] = common.bindTo(TABLES.systemUser.entitySet, item.assignedApproverId);
        }

        await common.getXrm().WebApi.createRecord(TABLES.referralItem.table, data);
    }

    /** Reads the referral number the server generated. Cosmetic only, so a failure must not fail the save. */
    async function readReferralNumber(referralRequestId) {
        try {
            const row = await common.getXrm().WebApi.retrieveRecord(
                TABLES.referralRequest.table, referralRequestId, "?$select=" + REQUEST.name);
            return row[REQUEST.name];
        } catch (error) {
            return undefined;
        }
    }

    // ------------------------------------------------------------------------------------------------------------
    // 4. Rules. Plain functions with no screen code, so they are easy to read and to test.
    // ------------------------------------------------------------------------------------------------------------

    /** A new blank item row. clientKey identifies the row on screen before it has an id in Dataverse. */
    function newItem() {
        return {
            clientKey: "k" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
            referralReasonId: "",
            coverSectionId: "",
            rationale: "",
            requiredAuthorityLevelId: "",
            underwriterAuthorityId: "",
            assignedApproverId: "" // the user behind the chosen authority
        };
    }

    /** A blank referral with one empty item. */
    function emptyDraft() {
        return {
            opportunityId: "",
            productId: "",
            customerId: "",
            countryId: "",
            priority: PRIORITIES[1].id, // Medium
            policyType: POLICY_TYPES[0].id, // Annual
            inceptionDate: "",
            description: "",
            items: [newItem()]
        };
    }

    /**
     * Checks the draft. Returns { context: { fieldName: message }, items: { clientKey: { fieldName: message } } }.
     * An empty result means the draft can be saved.
     */
    function validateDraft(draft) {
        const errors = { context: {}, items: {} };

        if (!draft.opportunityId) {
            errors.context.opportunityId = "Opportunity is required.";
        }
        if (!draft.productId) {
            errors.context.productId = "Product is required.";
        }
        if (!draft.description.trim()) {
            errors.context.description = "A short risk description is required.";
        }

        // Each item needs a reason, a cover, a rationale and a required authority level.
        draft.items.forEach(function (item) {
            const itemErrors = {};
            if (!item.referralReasonId) { itemErrors.referralReasonId = "Required."; }
            if (!item.coverSectionId) { itemErrors.coverSectionId = "Required."; }
            if (!item.rationale.trim()) { itemErrors.rationale = "Required."; }
            if (!item.requiredAuthorityLevelId) { itemErrors.requiredAuthorityLevelId = "Required."; }
            if (Object.keys(itemErrors).length > 0) {
                errors.items[item.clientKey] = itemErrors;
            }
        });

        // The same reason + cover twice on one referral is a duplicate. The server rejects it too; catching it here
        // saves the user a round trip.
        const seen = {};
        draft.items.forEach(function (item) {
            if (!item.referralReasonId || !item.coverSectionId) {
                return;
            }
            const combination = item.referralReasonId + "|" + item.coverSectionId;
            if (seen[combination]) {
                errors.items[item.clientKey] = Object.assign({}, errors.items[item.clientKey], {
                    referralReasonId: "This reason and cover combination is already on the referral."
                });
            }
            seen[combination] = true;
        });

        return errors;
    }

    // The words used for each item field in the warning banner.
    const ITEM_FIELD_NAMES = {
        referralReasonId: "Referral reason",
        coverSectionId: "Cover / section",
        rationale: "Underwriter rationale",
        requiredAuthorityLevelId: "Required authority level"
    };

    /** Flattens the validation result into sentences for the warning banner. */
    function buildErrorList(draft, errors) {
        const messages = Object.keys(errors.context).map(function (field) { return errors.context[field]; });
        draft.items.forEach(function (item, index) {
            const itemErrors = errors.items[item.clientKey];
            if (!itemErrors) {
                return;
            }
            Object.keys(itemErrors).forEach(function (field) {
                // "Required." on its own says nothing, so name the field. Other messages already say enough.
                const text = itemErrors[field] === "Required."
                    ? ITEM_FIELD_NAMES[field] + " is required."
                    : itemErrors[field];
                messages.push("Referral item " + (index + 1) + ": " + text);
            });
        });
        return messages;
    }

    /** Cover sections that can be chosen for a product (covers with no product apply to every product). */
    function getCoversForProduct(allCovers, productId) {
        if (!productId) {
            return [];
        }
        return allCovers.filter(function (cover) { return !cover.parentId || cover.parentId === productId; });
    }

    /** The item that needs the highest authority level, shown in the summary. Returns the level or undefined. */
    function getHighestLevel(draft, levels) {
        let highest;
        draft.items.forEach(function (item) {
            const level = levels.find(function (candidate) { return candidate.id === item.requiredAuthorityLevelId; });
            if (level && (!highest || (level.rank || 0) > (highest.rank || 0))) {
                highest = level;
            }
        });
        return highest;
    }

    /** The tick list in the summary panel. Returns [{ label, ok }]. */
    function buildChecklist(draft) {
        const count = draft.items.length;
        return [
            { label: "Opportunity selected", ok: !!draft.opportunityId },
            { label: "Product selected", ok: !!draft.productId },
            { label: "Risk description added", ok: !!draft.description.trim() },
            {
                label: "All " + count + " item" + (count > 1 ? "s" : "") + " complete",
                ok: draft.items.every(function (item) {
                    return item.referralReasonId && item.coverSectionId && item.rationale.trim() && item.requiredAuthorityLevelId;
                })
            },
            { label: "Approvers chosen (optional)", ok: draft.items.every(function (item) { return !!item.underwriterAuthorityId; }) }
        ];
    }

    function labelOf(options, id) {
        const found = options.find(function (option) { return option.id === id; });
        return found ? found.label : "";
    }

    // ------------------------------------------------------------------------------------------------------------
    // 5. The screen
    // ------------------------------------------------------------------------------------------------------------

    function showPage(container, sourceEntityName, sourceRecordId, currentUserId) {
        // Everything the screen knows lives in this one object. Change it, then call draw().
        const state = {
            loading: true,
            loadError: "",
            draft: emptyDraft(),
            // lists for the drop-downs
            opportunities: [],
            products: [],
            countries: [],
            reasons: [],
            covers: [],
            levels: [],
            // approvers are loaded per item, so they are kept by the item's clientKey
            approversByKey: {},
            approversLoading: {},
            customerName: "",
            busy: false,
            saveError: "",
            result: null, // set after a successful save
            showErrors: false // validation messages only appear after the first Save click
        };

        // ---- handlers that change the draft ----

        function findItem(clientKey) {
            return state.draft.items.find(function (item) { return item.clientKey === clientKey; });
        }

        /** Loads the approvers for one item (needs a product and a required level). */
        async function loadApproversFor(item) {
            const key = item.clientKey;
            const productId = state.draft.productId;

            if (!item.requiredAuthorityLevelId || !productId) {
                state.approversByKey[key] = [];
                draw();
                return;
            }

            const level = state.levels.find(function (candidate) { return candidate.id === item.requiredAuthorityLevelId; });
            state.approversLoading[key] = true;
            draw();
            try {
                const list = await loadEligibleAuthorities(productId, level ? level.rank || 0 : 0, state.levels);
                if (state.draft.productId === productId) { // ignore the answer if the product changed meanwhile
                    state.approversByKey[key] = list;
                }
            } catch (error) {
                state.approversByKey[key] = [];
            }
            state.approversLoading[key] = false;
            draw();
        }

        function changeItem(clientKey, changes) {
            const item = findItem(clientKey);
            if (!item) {
                return;
            }
            Object.assign(item, changes);
            if (changes.underwriterAuthorityId !== undefined) {
                const chosen = (state.approversByKey[clientKey] || []).find(function (a) { return a.id === item.underwriterAuthorityId; });
                item.assignedApproverId = chosen ? chosen.userId || "" : "";
            }
            // A different level means a different list of approvers, so the old choice no longer applies.
            if (changes.requiredAuthorityLevelId !== undefined) {
                item.underwriterAuthorityId = "";
                item.assignedApproverId = "";
                loadApproversFor(item);
            }
            draw();
        }

        function addItem() {
            state.draft.items.push(newItem());
            draw();
        }

        function removeItem(clientKey) {
            if (state.draft.items.length > 1) {
                state.draft.items = state.draft.items.filter(function (item) { return item.clientKey !== clientKey; });
                draw();
            }
        }

        function duplicateItem(clientKey) {
            const index = state.draft.items.findIndex(function (item) { return item.clientKey === clientKey; });
            if (index < 0) {
                return;
            }
            const original = state.draft.items[index];
            const copy = Object.assign(newItem(), {
                referralReasonId: original.referralReasonId,
                coverSectionId: original.coverSectionId,
                rationale: original.rationale,
                requiredAuthorityLevelId: original.requiredAuthorityLevelId,
                underwriterAuthorityId: original.underwriterAuthorityId,
                assignedApproverId: original.assignedApproverId
            });
            state.approversByKey[copy.clientKey] = state.approversByKey[original.clientKey] || [];
            state.draft.items.splice(index + 1, 0, copy);
            draw();
        }

        async function changeOpportunity(opportunityId) {
            state.draft.opportunityId = opportunityId;
            state.draft.customerId = "";
            state.customerName = "";
            draw();
            if (!opportunityId) {
                return;
            }
            try {
                const context = await loadOpportunityContext(opportunityId);
                if (state.draft.opportunityId === opportunityId) {
                    state.customerName = context.customerName;
                    state.draft.customerId = context.customerId || "";
                    draw();
                }
            } catch (error) {
                // The customer name is a convenience. A failure here must not block the form.
            }
        }

        function changeProduct(productId) {
            state.draft.productId = productId;
            // Covers and approvers belong to a product, so the old choices are cleared.
            state.draft.items.forEach(function (item) {
                item.coverSectionId = "";
                item.underwriterAuthorityId = "";
                item.assignedApproverId = "";
            });
            state.approversByKey = {};
            state.draft.items.forEach(function (item) {
                if (item.requiredAuthorityLevelId) {
                    loadApproversFor(item);
                }
            });
            draw();
        }

        function clearForm() {
            state.draft = emptyDraft();
            state.approversByKey = {};
            state.showErrors = false;
            state.result = null;
            state.saveError = "";
            draw();
        }

        async function save() {
            state.showErrors = true;
            state.saveError = "";

            const errors = validateDraft(state.draft);
            if (buildErrorList(state.draft, errors).length > 0) {
                draw();
                window.scrollTo(0, 0);
                return;
            }

            state.busy = true;
            draw();
            try {
                state.result = await saveDraft(state.draft, currentUserId);
                state.draft = emptyDraft();
                state.approversByKey = {};
                state.customerName = "";
                state.showErrors = false;
            } catch (error) {
                state.saveError = error.message;
                console.error("Referral save failed", error.originalError || error);
            }
            state.busy = false;
            draw();
            window.scrollTo(0, 0);
        }

        // ---- small pieces used while drawing ----

        /** A label, a control and (after the first Save click) the validation message. */
        function field(labelText, options, control) {
            return el("div", { className: options.full ? "field full" : "field" },
                el("label", { className: "label" }, labelText, options.required ? el("span", { className: "required" }, " *") : null),
                control,
                options.error ? el("div", { className: "field-error" }, options.error) : null,
                options.hint ? el("div", { className: "hint" }, options.hint) : null
            );
        }

        /** A drop-down. `options` is a list of { id, label }. */
        function dropdown(focusKey, options, selectedId, placeholder, onChange, disabled, invalid) {
            const items = [el("option", { value: "" }, placeholder)].concat(
                options.map(function (option) { return el("option", { value: option.id }, option.label); })
            );
            return el("select", {
                "data-focus-key": focusKey,
                className: invalid ? "invalid" : null,
                disabled: disabled,
                value: selectedId || "",
                onChange: function (event) { onChange(event.target.value); }
            }, items);
        }

        /** An error message for a field, but only after the user has tried to save. */
        function shown(message) {
            return state.showErrors ? message : undefined;
        }

        // ---- drawing ----

        function drawItem(item, index, covers, errors) {
            const itemErrors = errors.items[item.clientKey] || {};
            const approvers = state.approversByKey[item.clientKey] || [];
            const approversLoading = !!state.approversLoading[item.clientKey];
            const productSelected = !!state.draft.productId;
            const k = item.clientKey;

            const approverHint = !item.requiredAuthorityLevelId
                ? "Select a required level first"
                : approversLoading
                    ? "Checking who holds sufficient authority\u2026"
                    : approvers.length === 0
                        ? "No one currently holds sufficient authority for this product and level"
                        : approvers.length + " eligible for this product";

            return el("div", { className: state.showErrors && Object.keys(itemErrors).length ? "item invalid-item" : "item" },
                el("div", { className: "item-head" },
                    el("div", { className: "item-title" },
                        el("span", { className: "item-number" }, index + 1),
                        el("span", {}, labelOf(state.reasons, item.referralReasonId) || "Referral item " + (index + 1))),
                    el("div", {},
                        el("button", { type: "button", className: "small", onClick: function () { duplicateItem(k); } }, "Duplicate"),
                        " ",
                        el("button", {
                            type: "button",
                            className: "small",
                            disabled: state.draft.items.length <= 1,
                            title: state.draft.items.length <= 1 ? "A referral needs at least one item" : "Remove item",
                            onClick: function () { removeItem(k); }
                        }, "Remove"))),
                el("div", { className: "item-body grid-2" },
                    field("Referral reason", { required: true, error: shown(itemErrors.referralReasonId) },
                        dropdown("item-" + k + "-reason", state.reasons, item.referralReasonId, "Select a reason",
                            function (value) { changeItem(k, { referralReasonId: value }); }, false, state.showErrors && itemErrors.referralReasonId)),
                    field("Cover / section", {
                        required: true,
                        error: shown(itemErrors.coverSectionId),
                        hint: productSelected ? null : "Select a product in Context first"
                    },
                        dropdown("item-" + k + "-cover", covers, item.coverSectionId, productSelected ? "Select a cover" : "\u2014",
                            function (value) { changeItem(k, { coverSectionId: value }); }, !productSelected, state.showErrors && itemErrors.coverSectionId)),
                    field("Underwriter rationale", {
                        required: true,
                        full: true,
                        error: shown(itemErrors.rationale),
                        hint: "Explain why this exceeds your authority and what you are asking the approver to accept."
                    },
                        el("textarea", {
                            "data-focus-key": "item-" + k + "-rationale",
                            className: state.showErrors && itemErrors.rationale ? "invalid" : null,
                            rows: 3,
                            value: item.rationale,
                            placeholder: "e.g. Requested limit of GBP 2,000,000 exceeds my Level 4 authority of GBP 1,500,000. " +
                                "Loss record is clean for three years and the technical rate is met in full.",
                            onInput: function (event) { item.rationale = event.target.value; draw(); }
                        })),
                    field("Required authority level", { required: true, error: shown(itemErrors.requiredAuthorityLevelId) },
                        dropdown("item-" + k + "-level", state.levels, item.requiredAuthorityLevelId, "Select a level",
                            function (value) { changeItem(k, { requiredAuthorityLevelId: value }); }, false, state.showErrors && itemErrors.requiredAuthorityLevelId)),
                    field("Approver", { hint: approverHint },
                        dropdown("item-" + k + "-approver", approvers, item.underwriterAuthorityId,
                            approvers.length ? "Select an approver" : "\u2014",
                            function (value) { changeItem(k, { underwriterAuthorityId: value }); },
                            !item.requiredAuthorityLevelId || approvers.length === 0))
                ));
        }

        function build() {
            if (state.loading) {
                return el("div", { className: "centre" }, "Loading referral data\u2026");
            }

            const draft = state.draft;
            const errors = validateDraft(draft);
            const errorList = buildErrorList(draft, errors);
            const isValid = errorList.length === 0;
            const covers = getCoversForProduct(state.covers, draft.productId);
            const highest = getHighestLevel(draft, state.levels);

            // ---- banners ----
            const banners = [];
            if (state.loadError) {
                banners.push(el("div", { className: "banner error", role: "alert" },
                    el("strong", {}, "Could not load reference data"), state.loadError));
            }
            if (state.result) {
                const result = state.result;
                banners.push(el("div", { className: "banner success", role: "status" },
                    el("strong", {}, result.referralNumber ? "Referral " + result.referralNumber + " saved" : "Referral saved"),
                    result.itemCount + " referral item" + (result.itemCount > 1 ? "s" : "") + " created as Draft. ",
                    el("button", {
                        type: "button",
                        className: "link",
                        onClick: function () { common.openRecord(TABLES.referralRequest.table, result.referralRequestId); }
                    }, "Open the referral"),
                    " to review and submit it, or start another below."));
            }
            if (state.saveError) {
                banners.push(el("div", { className: "banner error", role: "alert" },
                    el("strong", {}, "The referral could not be saved"), state.saveError));
            }
            if (state.showErrors && !isValid) {
                banners.push(el("div", { className: "banner warning", role: "alert" },
                    el("strong", {}, errorList.length + (errorList.length === 1 ? " item needs" : " items need") + " your attention"),
                    el("ul", {}, errorList.slice(0, 6).map(function (message) { return el("li", {}, message); })),
                    errorList.length > 6 ? el("div", {}, "\u2026and " + (errorList.length - 6) + " more.") : null));
            }

            // ---- the Context card ----
            const contextCard = el("section", { className: "card" },
                el("div", { className: "card-head" },
                    el("div", {}, el("h2", { className: "card-title" }, "Context"),
                        el("p", { className: "card-desc" }, "Shared details that apply to every item on this referral"))),
                el("div", { className: "card-body grid-2" },
                    field("Opportunity", {
                        required: true,
                        full: true,
                        error: shown(errors.context.opportunityId),
                        hint: "The customer is taken from the opportunity."
                    },
                        dropdown("ctx-opportunity", state.opportunities, draft.opportunityId, "Select an opportunity",
                            changeOpportunity, false, state.showErrors && errors.context.opportunityId)),
                    field("Customer / insured", {},
                        el("div", { className: state.customerName ? "read-only" : "read-only empty" }, state.customerName || "From opportunity")),
                    field("Product / class of business", { required: true, error: shown(errors.context.productId) },
                        dropdown("ctx-product", state.products, draft.productId, "Select a product",
                            changeProduct, false, state.showErrors && errors.context.productId)),
                    field("Country of referral", {},
                        dropdown("ctx-country", state.countries, draft.countryId, "Select a country",
                            function (value) { draft.countryId = value; draw(); })),
                    field("Priority", {},
                        dropdown("ctx-priority", PRIORITIES, draft.priority, "Select",
                            function (value) { draft.priority = value || PRIORITIES[1].id; draw(); })),
                    field("Policy type", {},
                        dropdown("ctx-policytype", POLICY_TYPES, draft.policyType, "Select",
                            function (value) { draft.policyType = value || POLICY_TYPES[0].id; draw(); })),
                    field("Inception / effective date", {},
                        el("input", {
                            type: "date",
                            "data-focus-key": "ctx-inception",
                            value: draft.inceptionDate,
                            onInput: function (event) { draft.inceptionDate = event.target.value; draw(); }
                        })),
                    field("Business / risk description", {
                        required: true,
                        full: true,
                        error: shown(errors.context.description),
                        hint: "One short paragraph the approver reads first \u2014 what the risk is and why it is being referred."
                    },
                        el("textarea", {
                            "data-focus-key": "ctx-description",
                            className: state.showErrors && errors.context.description ? "invalid" : null,
                            rows: 3,
                            value: draft.description,
                            placeholder: "e.g. Renewal of a fleet of six coastal vessels trading UK and North Europe. " +
                                "Clean loss record. Referred for limit and duration.",
                            onInput: function (event) { draft.description = event.target.value; draw(); }
                        }))
                ));

            // ---- the Items card ----
            const itemsCard = el("section", { className: "card" },
                el("div", { className: "card-head" },
                    el("div", {}, el("h2", { className: "card-title" }, "Referral items"),
                        el("p", { className: "card-desc" }, "One item per reason \u2014 each is approved or rejected independently")),
                    el("button", { type: "button", onClick: addItem }, "+ Add item")),
                el("div", { className: "card-body items" },
                    draft.items.map(function (item, index) { return drawItem(item, index, covers, errors); })));

            // ---- the summary panel on the right ----
            const summary = el("aside", { className: "rail" },
                el("div", { className: "rail-card" },
                    el("h3", { className: "rail-title" }, "Summary"),
                    stat("Referral items", draft.items.length),
                    stat("Product", labelOf(state.products, draft.productId) || "\u2014"),
                    stat("Priority", labelOf(PRIORITIES, draft.priority) || "\u2014"),
                    stat("Highest authority", highest ? highest.label : "\u2014"),
                    el("ul", { className: "checklist" },
                        buildChecklist(draft).map(function (entry) {
                            return el("li", { className: entry.ok ? "ok" : "todo" }, (entry.ok ? "\u2713 " : "\u25CB ") + entry.label);
                        }))),
                el("div", { className: "info-card" },
                    el("h3", { className: "rail-title" }, "How approval works"),
                    el("p", {}, "Each item is routed to an approver who holds sufficient authority for the product. " +
                        "Items are decided independently \u2014 some may be authorised while others are rejected " +
                        "or sent back for more information.")));

            // ---- the bar at the bottom ----
            const count = draft.items.length;
            const commandBar = el("div", { className: "cmd-bar" },
                el("div", { className: "cmd-inner" },
                    el("div", { className: "cmd-status" },
                        isValid
                            ? "\u2713 Ready to save \u2014 " + count + " item" + (count > 1 ? "s" : "")
                            : "\u25CB " + errorList.length + " field" + (errorList.length === 1 ? "" : "s") + " still to complete"),
                    el("div", { className: "cmd-buttons" },
                        el("button", { type: "button", className: "link-button", disabled: state.busy, onClick: clearForm }, "Clear"),
                        el("button", { type: "button", className: "primary", disabled: state.busy, onClick: save },
                            state.busy ? "Saving\u2026" : "Save referral"))));

            return el("div", { className: "root" },
                el("div", { className: "shell" },
                    el("div", { className: "head" },
                        el("div", {},
                            el("h1", { className: "title" }, "Create referral"),
                            el("p", { className: "subtitle" },
                                "Raise a referral request for underwriting approval. Add one item per reason you need signed off.")),
                        el("span", { className: "pill" }, "Draft \u2014 not yet submitted")),
                    banners,
                    el("div", { className: "layout" }, el("div", {}, contextCard, itemsCard), summary)),
                commandBar);
        }

        /** One row of the summary panel. */
        function stat(label, value) {
            return el("div", { className: "stat" }, el("span", { className: "stat-key" }, label), el("span", { className: "stat-value" }, value));
        }

        function draw() {
            common.redraw(container, build);
        }

        // ---- first load ----
        draw(); // shows "Loading..."
        (async function load() {
            try {
                const lists = await Promise.all([
                    loadProducts(), loadReferralReasons(), loadCoverSections(),
                    loadAuthorityLevels(), loadOpportunities(), loadCountries()
                ]);
                state.products = lists[0];
                state.reasons = lists[1];
                state.covers = lists[2];
                state.levels = lists[3];
                state.opportunities = lists[4];
                state.countries = lists[5];

                // Opened from an opportunity: select it and show its customer.
                if (sourceEntityName === "opportunity" && sourceRecordId) {
                    const context = await loadOpportunityContext(sourceRecordId);
                    state.customerName = context.customerName;
                    state.draft.opportunityId = context.opportunityId;
                    state.draft.customerId = context.customerId || "";
                }
            } catch (error) {
                console.error("Referral Builder could not load", error);
                state.loadError =
                    "Reference data could not be loaded. Check that you have Read access to Referral Reason, " +
                    "Cover / Section, Authority Level, Product and Opportunity, then refresh.";
            }
            state.loading = false;
            draw();
        })();
    }

    /** Entry point. */
    function start(container) {
        showPage(container, common.getLaunchParam("entityName"), common.cleanGuid(common.getLaunchParam("recordId")), common.getCurrentUserId());
    }

    common.startPage(
        "app",
        start,
        "The referral builder could not start. Refresh the page, and if it keeps happening check that you have read access to " +
            "Referral Reason, Cover / Section, Authority Level, Product and Opportunity."
    );

    // Exposed so the tests in /tests can call these without opening a browser.
    return {
        PRIORITIES: PRIORITIES,
        POLICY_TYPES: POLICY_TYPES,
        newItem: newItem,
        emptyDraft: emptyDraft,
        validateDraft: validateDraft,
        buildErrorList: buildErrorList,
        getCoversForProduct: getCoversForProduct,
        getHighestLevel: getHighestLevel,
        buildChecklist: buildChecklist,
        loadEligibleAuthorities: loadEligibleAuthorities,
        saveDraft: saveDraft
    };
})();
