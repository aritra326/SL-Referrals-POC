/*
 * SL CRM - Copy Rationale page (page: slcrm_copyrationale.html)
 *
 * Opened from the Opportunity command bar (slcrm_OpportunityCommands.js) as a dialog:
 *   ?data=recordId=<opportunity id>&entityName=opportunity
 *
 * What it does
 *   1. Finds the Policy that the Opportunity belongs to.
 *   2. Lists every FINAL rationale written for that policy in earlier renewals (newest year first).
 *   3. Lets the underwriter preview one and copy it into a new DRAFT rationale on this opportunity,
 *      or start a blank draft instead. The old rationale is never changed.
 *
 * Data model: Policy 1:N Opportunity (one opportunity per renewal) and Opportunity 1:N Rationale.
 *
 * HOW THE FILE IS ORGANISED
 *   1. SCHEMA        - every Dataverse name used here, in one place
 *   2. Dataverse     - load the policy, load the old rationales, create the new rationale
 *   3. The screen    - state + draw() + button handlers
 */
var SLCRM = window.SLCRM || {};
window.SLCRM = SLCRM;

SLCRM.CopyRationale = (function () {
    "use strict";

    const common = SLCRM.common;
    const el = common.el;

    // ------------------------------------------------------------------------------------------------------------
    // 1. SCHEMA
    //
    // Two kinds of name appear below and they are NOT interchangeable:
    //   - column names such as "slcrm_pricing" are lower case, used in $select, $filter and when saving a value
    //   - navigation names such as "slcrm_Opportunity" are the lookup's SchemaName (mixed case). They go on the
    //     LEFT of an "@odata.bind" and inside $expand.
    // ------------------------------------------------------------------------------------------------------------
    const RATIONAL = {
        table: "slcrm_rational",
        entitySet: "slcrm_rationals",
        name: "slcrm_name",
        policyReference: "slcrm_policyreference",
        renewalYear: "slcrm_renewalyear",
        version: "slcrm_version",
        status: "slcrm_status",
        isCurrent: "slcrm_iscurrent",
        copiedOn: "slcrm_copiedon",
        // The text columns that are copied from the old rationale (and shown in the preview).
        copyableFields: [
            "slcrm_capacityconsiderations",
            "slcrm_captivearrangements",
            "slcrm_claimsexperience",
            "slcrm_licencelevel",
            "slcrm_negotiationoutcomestext",
            "slcrm_overseasterritoryexposures",
            "slcrm_ppmcategory",
            "slcrm_pricing",
            "slcrm_qualityassessmenttext",
            "slcrm_riskmanagementarrangements",
            "slcrm_sanctionsconsiderations",
            "slcrm_underwriteropinion"
        ],
        nav: {
            opportunity: "slcrm_Opportunity",
            policy: "slcrm_Policy",
            customer: "slcrm_CustomerInsured",
            underwriter: "slcrm_Underwriter",
            sourceRational: "slcrm_SourceRational",
            copiedBy: "slcrm_CopiedBy"
        }
    };

    // The choice values of slcrm_status.
    const STATUS = { draft: 100000000, final: 100000001 };

    // The words shown above each preview field.
    const FIELD_LABELS = {
        slcrm_capacityconsiderations: "Capacity considerations",
        slcrm_captivearrangements: "Captive arrangements",
        slcrm_claimsexperience: "Claims experience",
        slcrm_licencelevel: "Licence level",
        slcrm_negotiationoutcomestext: "Negotiation outcomes",
        slcrm_overseasterritoryexposures: "Overseas territory exposures",
        slcrm_ppmcategory: "PPM category",
        slcrm_pricing: "Pricing",
        slcrm_qualityassessmenttext: "Quality assessment",
        slcrm_riskmanagementarrangements: "Risk management arrangements",
        slcrm_sanctionsconsiderations: "Sanctions considerations",
        slcrm_underwriteropinion: "Underwriter opinion"
    };

    // ------------------------------------------------------------------------------------------------------------
    // 2. Dataverse calls (all through Xrm.WebApi)
    // ------------------------------------------------------------------------------------------------------------

    /**
     * Finds the policy linked to an opportunity. Returns null when the opportunity has no policy.
     * Result: { policyId, policyReference, customerId, customerName }
     */
    async function loadPolicyForOpportunity(opportunityId) {
        const xrm = common.getXrm();

        // Step 1: read the opportunity's policy lookup.
        // (Selecting a lookup's id needs the "_name_value" form. The bare column name gives a 404.)
        const opportunity = await xrm.WebApi.retrieveRecord("opportunity", opportunityId, "?$select=_slcrm_policy_value");
        const policyId = common.cleanGuid(opportunity._slcrm_policy_value);
        if (!policyId) {
            return null;
        }

        // Step 2: read the policy, and the name of its customer in the same call.
        const policy = await xrm.WebApi.retrieveRecord(
            "slcrm_policy",
            policyId,
            "?$select=slcrm_policyid,slcrm_name,_slcrm_customerinsured_value&$expand=slcrm_CustomerInsured($select=name)"
        );
        return {
            policyId: policy.slcrm_policyid,
            policyReference: policy.slcrm_name || "",
            customerId: common.cleanGuid(policy._slcrm_customerinsured_value),
            customerName: policy.slcrm_CustomerInsured ? policy.slcrm_CustomerInsured.name : ""
        };
    }

    /**
     * Every FINAL rationale that belongs to the same policy, except the ones already on the current opportunity.
     * Newest renewal year first. Each result is { id, name, renewalYear, underwriterName, statusLabel, modifiedOn, fields }.
     */
    async function loadCopyableRationales(policyId, currentOpportunityId) {
        if (!policyId) {
            return [];
        }

        const select = ["slcrm_rationalid", RATIONAL.name, RATIONAL.renewalYear, RATIONAL.status, "modifiedon"]
            .concat(RATIONAL.copyableFields)
            .join(",");

        // "slcrm_Opportunity/_slcrm_policy_value" means: look at the rationale's opportunity, and at its policy.
        const filter =
            RATIONAL.nav.opportunity + "/_slcrm_policy_value eq " + common.cleanGuid(policyId) +
            " and " + RATIONAL.status + " eq " + STATUS.final +
            " and _slcrm_opportunity_value ne " + common.cleanGuid(currentOpportunityId);

        const result = await common.getXrm().WebApi.retrieveMultipleRecords(
            RATIONAL.table,
            "?$select=" + select +
                "&$expand=" + RATIONAL.nav.underwriter + "($select=fullname)" +
                "&$filter=" + filter +
                "&$orderby=" + RATIONAL.renewalYear + " desc"
        );

        return result.entities.map(function (row) {
            const fields = {};
            RATIONAL.copyableFields.forEach(function (field) {
                fields[field] = row[field] ? String(row[field]) : "";
            });
            return {
                id: String(row.slcrm_rationalid),
                name: row[RATIONAL.name] || "Rationale",
                renewalYear: row[RATIONAL.renewalYear] === undefined ? null : row[RATIONAL.renewalYear],
                underwriterName: row[RATIONAL.nav.underwriter] ? row[RATIONAL.nav.underwriter].fullname : "Unassigned",
                statusLabel: row[RATIONAL.status] === STATUS.final ? "Final" : "Draft",
                modifiedOn: row.modifiedon || "",
                fields: fields
            };
        });
    }

    /**
     * Creates a new DRAFT rationale on the opportunity. Pass `source` to copy the text from an old rationale,
     * or leave it out to start blank. Returns the new record's id.
     */
    async function createRationale(options) {
        const source = options.source;
        const renewalYear = options.renewalYear;

        const data = {};
        data[RATIONAL.name] = source
            ? "Rationale \u2014 " + renewalYear + " (from " + (source.renewalYear || "prior") + ")"
            : "Rationale \u2014 " + renewalYear;
        data[RATIONAL.policyReference] = options.policy.policyReference;
        data[RATIONAL.renewalYear] = renewalYear;
        data[RATIONAL.version] = 1;
        data[RATIONAL.status] = STATUS.draft;
        data[RATIONAL.isCurrent] = true;
        data[RATIONAL.nav.opportunity + "@odata.bind"] = common.bindTo("opportunities", options.opportunityId);
        data[RATIONAL.nav.policy + "@odata.bind"] = common.bindTo("slcrm_policies", options.policy.policyId);
        data[RATIONAL.nav.underwriter + "@odata.bind"] = common.bindTo("systemusers", options.currentUserId);

        if (options.policy.customerId) {
            data[RATIONAL.nav.customer + "@odata.bind"] = common.bindTo("accounts", options.policy.customerId);
        }

        if (source) {
            // Record where the copy came from, who copied it and when.
            data[RATIONAL.nav.sourceRational + "@odata.bind"] = common.bindTo(RATIONAL.entitySet, source.id);
            data[RATIONAL.nav.copiedBy + "@odata.bind"] = common.bindTo("systemusers", options.currentUserId);
            data[RATIONAL.copiedOn] = new Date().toISOString();

            // Copy the text columns that have a value.
            RATIONAL.copyableFields.forEach(function (field) {
                if (source.fields[field]) {
                    data[field] = source.fields[field];
                }
            });
        }

        try {
            const created = await common.getXrm().WebApi.createRecord(RATIONAL.table, data);
            return common.cleanGuid(created.id);
        } catch (error) {
            throw common.friendlyError(
                error,
                "The rationale could not be created. Check that you have Create access on Rationale and try again."
            );
        }
    }

    // ------------------------------------------------------------------------------------------------------------
    // 3. The screen
    // ------------------------------------------------------------------------------------------------------------

    /** Builds the page for one opportunity and keeps its state. */
    function showPage(container, opportunityId, currentUserId) {
        // Everything the screen needs to know lives in this one object. Change it, then call draw().
        const state = {
            loading: true,
            loadError: "",
            policy: null, // null until loaded, or when the opportunity has no policy
            options: [], // the old rationales that can be copied
            expandedId: "", // the card whose preview is open
            selectedId: "", // the card chosen for copying
            busy: false,
            saveError: "",
            createdId: "" // set after a rationale has been created
        };
        const renewalYear = new Date().getFullYear();

        function selectedOption() {
            return state.options.find(function (option) { return option.id === state.selectedId; });
        }

        // ---- button handlers ----

        async function create(source) {
            if (!state.policy || state.busy) {
                return;
            }
            state.busy = true;
            state.saveError = "";
            draw();
            try {
                state.createdId = await createRationale({
                    opportunityId: opportunityId,
                    policy: state.policy,
                    renewalYear: renewalYear,
                    currentUserId: currentUserId,
                    source: source
                });
            } catch (error) {
                state.saveError = error.message || "The rationale could not be created.";
            }
            state.busy = false;
            draw();
        }

        // ---- drawing ----

        /** One old rationale: a header you can click to select, and a preview that opens and closes. */
        function drawCard(option) {
            const isExpanded = state.expandedId === option.id;
            const isSelected = state.selectedId === option.id;

            const previewButton = el("button", {
                type: "button",
                className: "link",
                onClick: function (event) {
                    event.stopPropagation(); // do not also select the card
                    state.expandedId = isExpanded ? "" : option.id;
                    draw();
                }
            }, isExpanded ? "Hide preview" : "Preview");

            const head = el("div", {
                className: "card-select",
                role: "radio",
                "aria-checked": isSelected ? "true" : "false",
                tabindex: 0,
                onClick: function () {
                    state.selectedId = option.id;
                    draw();
                }
            },
                el("div", { className: "card-year" }, option.renewalYear === null ? "\u2014" : option.renewalYear),
                el("div", { className: "card-info" },
                    el("h3", { className: "card-name" }, option.name),
                    el("p", { className: "card-meta" },
                        option.underwriterName + " \u00B7 " + option.statusLabel + " \u00B7 last updated " + common.formatDate(option.modifiedOn))),
                previewButton
            );

            const body = isExpanded
                ? el("div", { className: "card-preview" },
                    RATIONAL.copyableFields.map(function (field) {
                        const value = option.fields[field];
                        return el("div", { className: "preview-field" },
                            el("span", { className: "preview-label" }, FIELD_LABELS[field] || field),
                            el("p", { className: value ? "preview-value" : "preview-value empty" }, value || "Not recorded"));
                    }))
                : null;

            return el("div", { className: isSelected ? "rationale-card selected" : "rationale-card" }, head, body);
        }

        /** The whole page. Called again after every change to `state`. */
        function build() {
            if (state.loading) {
                return el("div", { className: "centre" }, "Loading previous rationales\u2026");
            }

            const policy = state.policy;
            const header = el("div", { className: "head" },
                el("h1", { className: "title" }, "Copy Rationale"),
                el("p", { className: "subtitle" },
                    "Reuse a previous year\u2019s underwriting rationale for this policy, or start a new one from scratch."),
                policy
                    ? el("p", { className: "policy-line" },
                        el("span", { className: "badge" }, policy.policyReference || "No policy reference"),
                        policy.customerName ? el("span", {}, policy.customerName) : null)
                    : null
            );

            const banners = [];
            if (state.loadError) {
                banners.push(el("div", { className: "banner error", role: "alert" },
                    el("strong", {}, "Couldn\u2019t load rationales"), state.loadError));
            }
            if (state.saveError) {
                banners.push(el("div", { className: "banner error", role: "alert" },
                    el("strong", {}, "Couldn\u2019t create the rationale"), state.saveError));
            }
            if (state.createdId) {
                banners.push(el("div", { className: "banner success", role: "status" },
                    el("strong", {}, "Rationale created"),
                    "A new Draft rationale for " + renewalYear + " has been created. ",
                    el("button", {
                        type: "button",
                        className: "link",
                        onClick: function () { common.openRecord(RATIONAL.table, state.createdId); }
                    }, "Open it")));
            }

            let list = null;
            if (!policy && !state.loadError) {
                list = el("div", { className: "empty" },
                    "This opportunity isn\u2019t linked to a policy yet, so there is no policy history to copy from. " +
                    "Link a policy to the opportunity first.");
            } else if (policy && state.options.length === 0) {
                list = el("div", { className: "empty" },
                    "No previous Final rationale is available yet for " + (policy.policyReference || "this policy") + ". " +
                    "This is the first year\u2019s rationale \u2014 start it from scratch below.");
            } else if (policy) {
                list = el("div", { className: "list" }, state.options.map(drawCard));
            }

            // The bar at the bottom with the two buttons. Hidden after a rationale has been created.
            let commandBar = null;
            if (policy && !state.createdId) {
                const selected = selectedOption();
                commandBar = el("div", { className: "cmd-bar" },
                    el("div", { className: "cmd-inner" },
                        el("span", { className: "cmd-status" },
                            selected ? "Selected: " + (selected.renewalYear || "") + " rationale" : "Select a rationale to copy, or start from scratch"),
                        el("div", { className: "cmd-buttons" },
                            el("button", {
                                type: "button",
                                disabled: state.busy,
                                onClick: function () { create(null); }
                            }, "Start from scratch"),
                            el("button", {
                                type: "button",
                                className: "primary",
                                disabled: state.busy || !selected,
                                onClick: function () { create(selected); }
                            }, state.busy ? "Working\u2026" : "Copy Selected Rationale"))));
            }

            return el("div", { className: "root" },
                el("div", { className: "shell" }, header, banners, list),
                commandBar);
        }

        function draw() {
            common.redraw(container, build);
        }

        // ---- first load ----
        draw(); // shows "Loading..."
        (async function load() {
            try {
                state.policy = await loadPolicyForOpportunity(opportunityId);
                if (state.policy) {
                    state.options = await loadCopyableRationales(state.policy.policyId, opportunityId);
                }
            } catch (error) {
                console.error("Copy Rationale could not load", error);
                state.loadError = "Previous rationales could not be loaded. Refresh the page and try again.";
            }
            state.loading = false;
            draw();
        })();
    }

    /** Entry point. */
    function start(container) {
        const opportunityId = common.cleanGuid(common.getLaunchParam("recordId"));
        if (!opportunityId) {
            common.showFatal(container, "This page needs to be opened from an Opportunity (no record id was supplied).");
            return;
        }
        showPage(container, opportunityId, common.getCurrentUserId());
    }

    common.startPage(
        "app",
        start,
        "Copy Rationale could not start. Refresh the page, and if it keeps happening check that you have read access to Policy and Rationale."
    );

    // Exposed so the tests in /tests can call these without opening a browser.
    return {
        RATIONAL: RATIONAL,
        STATUS: STATUS,
        loadPolicyForOpportunity: loadPolicyForOpportunity,
        loadCopyableRationales: loadCopyableRationales,
        createRationale: createRationale
    };
})();
