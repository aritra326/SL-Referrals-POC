/*
 * SL CRM - Referral decision dialog (page: slcrm_referraldecision.html)
 *
 * Opened by the command bar (slcrm_ReferralCommands.js) for these actions: Authorise, Reject,
 * AuthoriseWithRecommendations, RequestInformation, Onward (on a referral item) and CompleteRejected,
 * CompletePartial, Cancel (on a referral). It asks for a comment (and for Onward, who to send the item to),
 * then calls the Custom API that the plug-ins implement.
 *
 * The page URL carries ?data=recordId=<guid>&entityName=<table>&actionName=<action>.
 *
 * HOW THE FILE IS ORGANISED
 *   1. ACTIONS          - what each action asks the user for. Add or change an action here.
 *   2. Validation       - the checks done before we call the server (the server checks again).
 *   3. Dataverse calls  - three small functions, all through Xrm.WebApi.
 *   4. The screen       - builds the dialog and reacts to clicks.
 */
var SLCRM = window.SLCRM || {};
window.SLCRM = SLCRM;

SLCRM.DecisionDialog = (function () {
    "use strict";

    const common = SLCRM.common;
    const el = common.el;

    // ------------------------------------------------------------------------------------------------------------
    // 1. ACTIONS
    //
    //   name              the ActionName the Custom API expects
    //   target            the table the action is run on
    //   title             heading of the dialog
    //   commentLabel      label above the comment box
    //   commentHint       grey placeholder text inside the comment box
    //   commentRequired   true = the user must type something
    //   commentMaxLength  optional longest comment the server accepts
    //   confirmLabel      text on the main button
    //   consequence       one sentence that says what will happen
    //   requiresAuthority true = the user must also pick who to send the item to (Onward only)
    // ------------------------------------------------------------------------------------------------------------
    const ACTIONS = [
        {
            name: "Authorise",
            target: "slcrm_referralitem",
            title: "Authorise referral item",
            commentLabel: "Comment",
            commentHint: "Optional. Anything the underwriter should know about this authorisation.",
            commentRequired: false,
            confirmLabel: "Authorise",
            consequence: "The item is authorised and a permanent decision record is created."
        },
        {
            name: "Reject",
            target: "slcrm_referralitem",
            title: "Reject referral item",
            commentLabel: "Rejection reason",
            commentHint: "Required. Explain why the item is rejected.",
            commentRequired: true,
            confirmLabel: "Reject",
            consequence: "The item is rejected and a permanent decision record is created. The underwriter can then revise it."
        },
        {
            name: "AuthoriseWithRecommendations",
            target: "slcrm_referralitem",
            title: "Authorise with recommendations",
            commentLabel: "Recommendations",
            commentHint: "Required. The advice that goes with this authorisation.",
            commentRequired: true,
            commentMaxLength: 4000,
            confirmLabel: "Authorise",
            consequence: "The item is authorised with your recommendations and a decision record is created."
        },
        {
            name: "RequestInformation",
            target: "slcrm_referralitem",
            title: "Request information",
            commentLabel: "Information needed",
            commentHint: "Required. Say what the underwriter needs to provide.",
            commentRequired: true,
            confirmLabel: "Request information",
            consequence: "The item goes back to the underwriter and a decision record is created."
        },
        {
            name: "Onward",
            target: "slcrm_referralitem",
            title: "Onward for approval",
            commentLabel: "Reason for routing onward",
            commentHint: "Required. Why does this item need a higher authority?",
            commentRequired: true,
            confirmLabel: "Send onward",
            consequence: "The item goes to the authority you choose and a permanent decision record is created.",
            requiresAuthority: true
        },
        {
            name: "CompleteRejected",
            target: "slcrm_referralrequest",
            title: "Accept rejection",
            commentLabel: "Comment",
            commentHint: "Required. Please confirm your acceptance of the rejected outcome and provide a comment.",
            commentRequired: true,
            confirmLabel: "Close as rejected",
            consequence: "Please confirm your acceptance of the rejected outcome and provide a comment. " +
                "The referral is closed as Rejected and can no longer be changed."
        },
        {
            name: "CompletePartial",
            target: "slcrm_referralrequest",
            title: "Complete partial outcome",
            commentLabel: "Outcome summary",
            commentHint: "Optional. Summarise the authorised scope you are proceeding with.",
            commentRequired: false,
            confirmLabel: "Complete",
            consequence: "You proceed with the authorised items only. The rejected items stay as historical evidence " +
                "and the referral is closed as Partially Authorised."
        },
        {
            name: "Cancel",
            target: "slcrm_referralrequest",
            title: "Cancel referral",
            commentLabel: "Cancellation reason",
            commentHint: "Required. Why is the referral no longer needed?",
            commentRequired: true,
            confirmLabel: "Cancel referral",
            consequence: "Open items are cancelled and the referral is closed. Items that already have an outcome are kept."
        }
    ];

    /** Finds the entry in ACTIONS for a table and action name (the name is not case sensitive). */
    function findAction(target, name) {
        const wanted = (name || "").toLowerCase();
        return ACTIONS.find(function (action) {
            return action.target === target && action.name.toLowerCase() === wanted;
        });
    }

    // ------------------------------------------------------------------------------------------------------------
    // 2. Validation. Each returns the message to show, or null when everything is fine.
    // ------------------------------------------------------------------------------------------------------------

    function validateComment(action, comment) {
        if (action.commentRequired && (comment || "").trim().length === 0) {
            return "Enter the " + action.commentLabel.toLowerCase() + " before you continue.";
        }
        return null;
    }

    function validateAuthority(action, authorityId) {
        if (action.requiresAuthority && !authorityId) {
            return "Choose the authority to send the item to.";
        }
        return null;
    }

    // ------------------------------------------------------------------------------------------------------------
    // 3. Dataverse calls (all through Xrm.WebApi)
    // ------------------------------------------------------------------------------------------------------------

    // Which Custom API runs the action for each table.
    const ACTION_API = {
        slcrm_referralitem: "slcrm_ExecuteReferralItemAction",
        slcrm_referralrequest: "slcrm_ExecuteReferralRequestAction"
    };

    // Dataverse returns the readable text of a choice column under this extra property name.
    const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

    /**
     * Reads the few fields shown at the top of the dialog (what record are we acting on?).
     * Returns { heading, subheading, status }.
     */
    async function loadContext(target, recordId) {
        const xrm = common.getXrm();

        if (target === "slcrm_referralitem") {
            const item = await xrm.WebApi.retrieveRecord(
                "slcrm_referralitem",
                recordId,
                "?$select=slcrm_referralitemnumber,slcrm_itemsummary,statuscode&$expand=slcrm_Referral($select=slcrm_name)"
            );
            return {
                heading: item.slcrm_referralitemnumber || item.slcrm_itemsummary || "Referral item",
                subheading: item.slcrm_Referral ? item.slcrm_Referral.slcrm_name : "",
                status: item["statuscode" + FORMATTED] || ""
            };
        }

        const referral = await xrm.WebApi.retrieveRecord("slcrm_referralrequest", recordId, "?$select=slcrm_name,statuscode");
        return {
            heading: referral.slcrm_name || "Referral",
            subheading: "",
            status: referral["statuscode" + FORMATTED] || ""
        };
    }

    /**
     * Asks the server which authorities this item can be sent onward to. The server applies the real eligibility
     * rules; this screen only shows the answer. Returns a list of { id, name, approver, level, rank, licence, product }.
     */
    async function loadEligibleAuthorities(itemId) {
        const result = await common.runBoundAction("slcrm_referralitem", itemId, "slcrm_GetEligibleAuthorities", {});
        try {
            return JSON.parse(result.AuthoritiesJson || "[]");
        } catch (e) {
            throw new Error("The list of authorities could not be read.");
        }
    }

    /** Runs the action on the server. Throws when the server refuses (the message says why). */
    async function runAction(target, recordId, actionName, comment, authorityId) {
        const parameters = { ActionName: { type: "Edm.String", value: actionName } };
        if ((comment || "").trim().length > 0) {
            parameters.Comment = { type: "Edm.String", value: comment.trim() };
        }
        if (authorityId) {
            parameters.NewAuthorityId = { type: "Edm.Guid", value: common.cleanGuid(authorityId) };
        }
        return common.runBoundAction(target, recordId, ACTION_API[target], parameters);
    }

    // ------------------------------------------------------------------------------------------------------------
    // 4. The screen
    // ------------------------------------------------------------------------------------------------------------

    /** Builds the dialog, wires up the buttons and loads the data. Returns nothing; everything happens on the page. */
    function showDialog(container, action, target, recordId) {
        // What the user has done so far.
        let selectedAuthorityId = "";
        let authorityOptions = []; // the list the server returned (Onward only)
        let authorityState = "loading"; // "loading", "ready" or "failed"
        let busy = false; // true while the server call is running
        let done = false; // true after the server accepted the action

        // ---- the pieces of the screen ----
        const contextBox = el("div", { className: "context", "aria-label": "Record" }, el("div", { className: "context-sub" }, "Loading\u2026"));
        const authorityBox = el("fieldset", { className: "authorities" });
        const commentInput = el("textarea", {
            id: "decision-comment",
            className: "comment",
            rows: 5,
            maxlength: action.commentMaxLength,
            placeholder: action.commentHint,
            "aria-required": action.commentRequired ? "true" : null
        });
        const problemBox = el("div", { className: "message error", role: "alert" });
        const statusBox = el("div", { className: "message", role: "status" });
        const cancelButton = el("button", { type: "button", className: "secondary" }, "Cancel");
        const confirmButton = el("button", { type: "button", className: "primary" }, action.confirmLabel);

        // ---- small functions that update the screen ----

        /** Shows an error line (problem) or clears it. `text` may be a string or null. */
        function showProblem(text, code) {
            common.setContent(problemBox, document.createDocumentFragment());
            if (text) {
                problemBox.appendChild(document.createTextNode(text));
                if (code) {
                    problemBox.appendChild(el("span", { className: "code" }, " (" + code + ")"));
                }
            }
            problemBox.style.display = text ? "block" : "none";
            commentInput.setAttribute("aria-invalid", text ? "true" : "false");
        }

        /** Enables or disables the controls to match what is happening. */
        function refreshControls() {
            const locked = busy || done;
            const waitingForAuthorities = action.requiresAuthority && authorityState !== "ready";
            commentInput.disabled = locked;
            cancelButton.disabled = locked;
            confirmButton.disabled = locked || waitingForAuthorities || noOneToChoose();
            authorityBox.disabled = locked;
            statusBox.textContent = busy ? "Working\u2026" : done ? "Done. This window will close." : "";
            statusBox.className = done ? "message success" : "message";
        }

        /** True when the server says nobody is eligible, so the action cannot go ahead. */
        function noOneToChoose() {
            return !!action.requiresAuthority && authorityState === "ready" && authorityOptions.length === 0;
        }

        /** Draws the "Send to" list for Onward. */
        function drawAuthorities(errorMessage, errorCode) {
            const content = [el("legend", { className: "label" }, "Send to *")];

            if (authorityState === "loading") {
                content.push(el("div", { className: "context-sub" }, "Loading eligible authorities\u2026"));
            } else if (authorityState === "failed") {
                content.push(
                    el("div", { className: "message error", role: "alert" },
                        "The eligible authorities could not be loaded: " + errorMessage,
                        errorCode ? el("span", { className: "code" }, " (" + errorCode + ")") : null)
                );
            } else if (authorityOptions.length === 0) {
                content.push(el("div", { className: "message", role: "status" }, "No eligible higher authority is available for this item."));
            } else {
                content.push(buildAuthorityTable());
            }

            common.setContent(authorityBox, el("div", {}, content));
        }

        /** The table of authorities with a radio button on each row. */
        function buildAuthorityTable() {
            const rows = authorityOptions.map(function (option) {
                const radio = el("input", {
                    type: "radio",
                    name: "authority",
                    value: option.id,
                    "aria-label": option.name,
                    checked: option.id === selectedAuthorityId,
                    onChange: function () {
                        selectedAuthorityId = option.id;
                        showProblem(null);
                        drawAuthorities();
                    }
                });
                return el("tr", { className: option.id === selectedAuthorityId ? "selected" : null },
                    el("td", {}, radio),
                    el("td", {}, option.approver || option.name),
                    el("td", {}, option.level),
                    el("td", {}, option.rank),
                    el("td", {}, option.licence || "-"),
                    el("td", {}, option.product || "-")
                );
            });

            return el("table", { className: "picker" },
                el("thead", {}, el("tr", {},
                    el("th", {}), el("th", {}, "Approver"), el("th", {}, "Level"),
                    el("th", {}, "Rank"), el("th", {}, "Licence / scheme"), el("th", {}, "Product"))),
                el("tbody", {}, rows)
            );
        }

        /** Draws the record details at the top. `context` is null while loading. */
        function drawContext(context, failed) {
            const lines = [];
            if (context) {
                lines.push(el("div", { className: "context-main" }, context.heading));
                if (context.subheading) {
                    lines.push(el("div", { className: "context-sub" }, context.subheading));
                }
                if (context.status) {
                    lines.push(el("div", { className: "context-sub" }, "Status: " + context.status));
                }
            } else if (failed) {
                lines.push(el("div", { className: "context-sub" }, "Record details could not be loaded."));
            }
            common.setContent(contextBox, el("div", {}, lines));
        }

        // ---- what happens when the user clicks Confirm ----
        async function confirm() {
            if (busy || done) {
                return; // a fast double click must not send the request twice
            }

            const problem = validateAuthority(action, selectedAuthorityId) || validateComment(action, commentInput.value);
            showProblem(problem);
            if (problem) {
                return;
            }

            busy = true;
            refreshControls();
            try {
                await runAction(target, recordId, action.name, commentInput.value, selectedAuthorityId);
                done = true;
                busy = false;
                refreshControls();
                common.closeDialog();
            } catch (error) {
                busy = false;
                const described = common.describeError(error, "Something went wrong. Please try again.");
                showProblem(described.message, described.code);
                refreshControls();
            }
        }

        // ---- put it all on the page ----
        confirmButton.addEventListener("click", confirm);
        cancelButton.addEventListener("click", function () {
            common.closeDialog();
        });
        commentInput.addEventListener("input", function () {
            showProblem(null);
        });

        const dialog = el("div", { className: "dialog" },
            el("h1", { className: "title" }, action.title),
            contextBox,
            el("p", { className: "consequence" }, action.consequence),
            action.requiresAuthority ? authorityBox : null,
            el("label", { className: "label", for: "decision-comment" },
                action.commentLabel, action.commentRequired ? " *" : ""),
            commentInput,
            problemBox,
            statusBox,
            el("div", { className: "buttons" }, cancelButton, confirmButton)
        );
        common.setContent(container, dialog);
        showProblem(null);
        refreshControls();

        // ---- load the data the screen needs ----
        loadContext(target, recordId)
            .then(function (context) { drawContext(context, false); })
            .catch(function () { drawContext(null, true); }); // not fatal: the user can still act

        if (action.requiresAuthority) {
            drawAuthorities();
            loadEligibleAuthorities(recordId)
                .then(function (options) {
                    authorityOptions = options;
                    authorityState = "ready";
                    drawAuthorities();
                    refreshControls();
                })
                .catch(function (error) {
                    authorityState = "failed";
                    const described = common.describeError(error, "Please try again.");
                    drawAuthorities(described.message, described.code);
                    refreshControls();
                });
        }
    }

    /** Entry point: reads the launch parameters and shows the dialog. */
    function start(container) {
        const recordId = common.cleanGuid(common.getLaunchParam("recordId"));
        const target = common.getLaunchParam("entityName");
        const action = findAction(target, common.getLaunchParam("actionName"));

        if (!recordId || !action) {
            common.showFatal(container, "This dialog must be opened from a referral or referral item command.");
            return;
        }
        showDialog(container, action, target, recordId);
    }

    common.startPage("app", start, "The dialog could not start. Close it and try again.");

    // Exposed so the tests in /tests can check the rules without opening a browser.
    return {
        ACTIONS: ACTIONS,
        findAction: findAction,
        validateComment: validateComment,
        validateAuthority: validateAuthority,
        loadContext: loadContext,
        loadEligibleAuthorities: loadEligibleAuthorities,
        runAction: runAction
    };
})();
