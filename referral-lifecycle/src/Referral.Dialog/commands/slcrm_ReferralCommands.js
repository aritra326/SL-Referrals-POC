/*
 * SL CRM - Referral lifecycle command bar functions
 *named: slcrm_ReferralCommands.js
 * Update only CONFIG.customPageName if the custom page's unique name differs.
 */
var SLCRM = window.SLCRM || {};

SLCRM.ReferralCommands = (function () {
    "use strict";

    const CONFIG = {
        parentEntity: "slcrm_referralrequest",
        childEntity: "slcrm_referralitem",
        parentApi: "slcrm_ExecuteReferralRequestAction",
        childApi: "slcrm_ExecuteReferralItemAction",
        customPageName: "slcrm_ReferralLifecycleDialog",

        // Comment-style actions are handled by the decision dialog web resource (src/Referral.Dialog).
        // Anything not listed here still uses the custom page.
        decisionDialogPage: "slcrm_referraldecision.html",
        decisionDialogActions: [
            "slcrm_referralitem:Authorise",
            "slcrm_referralitem:Reject",
            "slcrm_referralitem:AuthoriseWithRecommendations",
            "slcrm_referralitem:RequestInformation",
            "slcrm_referralitem:Onward",
            "slcrm_referralrequest:CompleteRejected",
            "slcrm_referralrequest:CompletePartial",
            "slcrm_referralrequest:Cancel"
        ]
    };


    // ==============================================================================================================
    // DEMO AUTHORIZATION LAYER (temporary)
    //
    // Decides which command-bar actions a user may START, from membership of two demo teams. This is a convenience
    // for the demo, NOT the underwriting-authority rule: the Custom API plug-ins still check the real rules on every
    // call (assigned approver / primary underwriter / eligible authority, product, level, dates). Being in the
    // approver team never lets someone approve an item they are not eligible to approve.
    //
    // To replace it with the final business-unit / team / security-role model, change DEMO_ACCESS only, or delete
    // this section and the one assertDemoAccess() call in saveAndGetContext().
    // ==============================================================================================================
    const DEMO_ACCESS = {
        teams: {
            requestor: "SL Referral Requestors",
            approver: "SL Referral Approvers"
        },

        // Who may start each command: "entity:ActionName" -> "requestor" | "approver". Commands not listed are open.
        actions: {
            "slcrm_referralrequest:Submit": "requestor",
            "slcrm_referralrequest:SubmitRevisions": "requestor",
            "slcrm_referralrequest:Cancel": "requestor",
            "slcrm_referralrequest:CompletePartial": "requestor",
            "slcrm_referralrequest:CompleteRejected": "requestor",
            "slcrm_referralitem:Resubmit": "requestor",
            "slcrm_referralitem:CreateRevision": "requestor",
            "slcrm_referralitem:StartReview": "approver",
            "slcrm_referralitem:RequestInformation": "approver",
            "slcrm_referralitem:Onward": "approver",
            "slcrm_referralitem:Authorise": "approver",
            "slcrm_referralitem:AuthoriseWithRecommendations": "approver",
            "slcrm_referralitem:AuthoriseWithConditions": "approver",
            "slcrm_referralitem:Reject": "approver"
        },

        // A team that does not exist in the environment is not enforced, so nobody is locked out before the teams are created.
        enforceWhenTeamMissing: false,

        cacheMinutes: 5
    };

    function demoCacheKey(userId) {
        return "slcrm.demoAccess." + userId;
    }

    function readDemoCache(userId) {
        try {
            const cached = JSON.parse(window.sessionStorage.getItem(demoCacheKey(userId)) || "null");
            if (cached && Date.now() - cached.at < DEMO_ACCESS.cacheMinutes * 60000) {
                return cached.value;
            }
        } catch (e) {
            // Storage can be blocked; fall through and ask the server.
        }
        return null;
    }

    function writeDemoCache(userId, value) {
        try {
            window.sessionStorage.setItem(demoCacheKey(userId), JSON.stringify({ at: Date.now(), value: value }));
        } catch (e) {
            // Not fatal: the next command just asks again.
        }
    }

    function teamNamesCondition() {
        return Object.keys(DEMO_ACCESS.teams).map(function (key) {
            return "<value>" + DEMO_ACCESS.teams[key] + "</value>";
        }).join("");
    }

    /** Returns { exists: {requestor, approver}, member: {requestor, approver} } for the signed-in user. */
    async function loadDemoAccess() {
        const userId = cleanGuid(Xrm.Utility.getGlobalContext().userSettings.userId);
        const cached = readDemoCache(userId);
        if (cached) {
            return cached;
        }

        const filter = "<filter><condition attribute=\"name\" operator=\"in\">" + teamNamesCondition() + "</condition></filter>";
        const existingXml = "<fetch><entity name=\"team\"><attribute name=\"name\"/>" + filter + "</entity></fetch>";
        const memberXml = "<fetch><entity name=\"team\"><attribute name=\"name\"/>" + filter +
            "<link-entity name=\"teammembership\" from=\"teamid\" to=\"teamid\" intersect=\"true\">" +
            "<filter><condition attribute=\"systemuserid\" operator=\"eq\" value=\"" + userId + "\"/></filter>" +
            "</link-entity></entity></fetch>";

        const existing = await Xrm.WebApi.retrieveMultipleRecords("team", "?fetchXml=" + encodeURIComponent(existingXml));
        const mine = await Xrm.WebApi.retrieveMultipleRecords("team", "?fetchXml=" + encodeURIComponent(memberXml));

        const names = function (result) {
            return result.entities.map(function (t) { return (t.name || "").toLowerCase(); });
        };
        const existingNames = names(existing);
        const memberNames = names(mine);
        const access = { exists: {}, member: {} };
        Object.keys(DEMO_ACCESS.teams).forEach(function (key) {
            const team = DEMO_ACCESS.teams[key].toLowerCase();
            access.exists[key] = existingNames.indexOf(team) !== -1;
            access.member[key] = memberNames.indexOf(team) !== -1;
        });

        writeDemoCache(userId, access);
        return access;
    }

    /** Throws a friendly error when the user's team does not cover this command. Never blocks on a lookup failure. */
    async function assertDemoAccess(entityName, actionName) {
        const needed = DEMO_ACCESS.actions[entityName + ":" + actionName];
        if (!needed) {
            return;
        }

        let access;
        try {
            access = await loadDemoAccess();
        } catch (e) {
            console.warn("Demo access check skipped: team membership could not be read.", e);
            return;
        }

        if (!access.exists[needed] && !DEMO_ACCESS.enforceWhenTeamMissing) {
            return;
        }

        if (!access.member[needed]) {
            throw new Error(
                "This action is for members of the '" + DEMO_ACCESS.teams[needed] + "' team. " +
                "Ask an administrator to add you if you need it.");
        }
    }

    let busy = false;

    function cleanGuid(value) {
        return (value || "").replace(/[{}]/g, "");
    }

    function getApiName(entityName) {
        if (entityName === CONFIG.parentEntity) {
            return CONFIG.parentApi;
        }

        if (entityName === CONFIG.childEntity) {
            return CONFIG.childApi;
        }

        throw new Error("This command is available only on Referral Request or Referral Item.");
    }

    async function saveAndGetContext(primaryControl, actionName) {
        const form = primaryControl;

        if (!form || !form.data || !form.data.entity) {
            throw new Error("This command must be run from a Referral Request or Referral Item form.");
        }

        await assertDemoAccess(form.data.entity.getEntityName(), actionName);

        if (form.data.entity.getIsDirty() || !form.data.entity.getId()) {
            await form.data.save();
        }

        const recordId = cleanGuid(form.data.entity.getId());
        if (!recordId) {
            throw new Error("The record must be saved before this action can be used.");
        }

        return {
            form: form,
            entityName: form.data.entity.getEntityName(),
            recordId: recordId
        };
    }

    async function showError(error) {
        await Xrm.Navigation.openErrorDialog({
            message: error && error.message
                ? error.message
                : "The referral action could not be completed."
        });
    }

    async function execute(primaryControl, actionName, comment, newAuthorityId) {
        let progressShown = false;

        try {
            if (busy) {
                return;
            }

            busy = true;
            const context = await saveAndGetContext(primaryControl, actionName);
            const apiName = getApiName(context.entityName);

            const request = {
                Target: {
                    entityType: context.entityName,
                    id: context.recordId
                },
                ActionName: actionName,
                Comment: comment || ""
            };

            if (newAuthorityId) {
                request.NewAuthorityId = cleanGuid(newAuthorityId);
            }

            request.getMetadata = function () {
                const parameterTypes = {
                    Target: {
                        typeName: "mscrm." + context.entityName,
                        structuralProperty: 5
                    },
                    ActionName: {
                        typeName: "Edm.String",
                        structuralProperty: 1
                    },
                    Comment: {
                        typeName: "Edm.String",
                        structuralProperty: 1
                    },
                    NewAuthorityId: {
                        typeName: "Edm.Guid",
                        structuralProperty: 1
                    }
                };

                return {
                    boundParameter: "Target",
                    parameterTypes: parameterTypes,
                    operationType: 0,
                    operationName: apiName
                };
            };

            Xrm.Utility.showProgressIndicator("Processing referral action...");
            progressShown = true;

            const response = await Xrm.WebApi.online.execute(request);
            if (!response.ok) {
                throw new Error("The referral action was not completed.");
            }

            const result = response.status === 204 ? {} : await response.json();
            const resultId = cleanGuid(result.ResultRecordId);

            Xrm.Utility.closeProgressIndicator();
            progressShown = false;

            if (resultId && resultId.toLowerCase() !== context.recordId.toLowerCase()) {
                await Xrm.Navigation.openForm({
                    entityName: context.entityName,
                    entityId: resultId
                });
                return;
            }

            await context.form.data.refresh(false);
            context.form.ui.refreshRibbon();
        } catch (error) {
            if (progressShown) {
                Xrm.Utility.closeProgressIndicator();
                progressShown = false;
            }
            await showError(error);
        } finally {
            if (progressShown) {
                Xrm.Utility.closeProgressIndicator();
            }
            busy = false;
        }
    }

    async function confirmAndExecute(primaryControl, actionName, title, text) {
        const answer = await Xrm.Navigation.openConfirmDialog({
            title: title,
            text: text,
            confirmButtonLabel: "Continue",
            cancelButtonLabel: "Cancel"
        });

        if (answer.confirmed) {
            await execute(primaryControl, actionName, "", null);
        }
    }

    function usesDecisionDialog(entityName, actionName) {
        return CONFIG.decisionDialogActions.indexOf(entityName + ":" + actionName) !== -1;
    }

    function buildDialogPage(context, actionName) {
        if (usesDecisionDialog(context.entityName, actionName)) {
            return {
                pageType: "webresource",
                webresourceName: CONFIG.decisionDialogPage,
                data: "recordId=" + context.recordId + "&entityName=" + context.entityName + "&actionName=" + actionName
            };
        }

        return {
            pageType: "custom",
            name: CONFIG.customPageName,
            pageInput: {
                recordId: context.recordId,
                entityName: context.entityName,
                actionName: actionName
            }
        };
    }

    async function openLifecycleDialog(primaryControl, actionName, title) {
        try {
            if (busy) {
                return;
            }

            busy = true;
            const context = await saveAndGetContext(primaryControl, actionName);

            await Xrm.Navigation.navigateTo(
                buildDialogPage(context, actionName),
                {
                    target: 2,
                    position: 1,
                    width: { value: 620, unit: "px" },
                    height: { value: 520, unit: "px" },
                    title: title
                }
            );

            // The dialog is closed by now (after a successful action or a cancel); show the record as it is now.
            await context.form.data.refresh(false);
            context.form.ui.refreshRibbon();
        } catch (error) {
            await showError(error);
        } finally {
            busy = false;
        }
    }

    return {
        // Used by the custom page only after it has collected user input.
        execute: execute,

        // Referral Request actions
        submitReferral: function (primaryControl) {
            return confirmAndExecute(primaryControl, "Submit", "Submit referral", "Save and submit all included current draft items?");
        },
        submitRevisions: function (primaryControl) {
            return confirmAndExecute(primaryControl, "SubmitRevisions", "Submit revisions", "Save and submit the current revision draft items?");
        },
        completePartialOutcome: function (primaryControl) {
            return openLifecycleDialog(primaryControl, "CompletePartial", "Complete partial outcome");
        },
        completeRejectedOutcome: function (primaryControl) {
            return openLifecycleDialog(primaryControl, "CompleteRejected", "Complete rejected outcome");
        },
        cancelReferral: function (primaryControl) {
            return openLifecycleDialog(primaryControl, "Cancel", "Cancel referral");
        },

        // Referral Item actions
        startReview: function (primaryControl) {
            return confirmAndExecute(primaryControl, "StartReview", "Start review", "Start reviewing this referral item?");
        },
        requestInformation: function (primaryControl) {
            return openLifecycleDialog(primaryControl, "RequestInformation", "Request information");
        },
        resubmitItem: function (primaryControl) {
            return confirmAndExecute(primaryControl, "Resubmit", "Resubmit item", "Save your response and return this item for review?");
        },
        onwardForApproval: function (primaryControl) {
            return openLifecycleDialog(primaryControl, "Onward", "Onward for approval");
        },
        authorise: function (primaryControl) {
            return openLifecycleDialog(primaryControl, "Authorise", "Authorise referral item");
        },
        authoriseWithRecommendations: function (primaryControl) {
            return openLifecycleDialog(primaryControl, "AuthoriseWithRecommendations", "Authorise with recommendations");
        },
        authoriseWithConditions: function (primaryControl) {
            return openLifecycleDialog(primaryControl, "AuthoriseWithConditions", "Authorise with conditions");
        },
        reject: function (primaryControl) {
            return openLifecycleDialog(primaryControl, "Reject", "Reject referral item");
        },
        createRevision: function (primaryControl) {
            return confirmAndExecute(primaryControl, "CreateRevision", "Create revision", "Create a new draft revision and supersede this version?");
        },
        // Cancellation is a referral-level operation only. The same handler serves the "Cancel Referral" button;
        // if it is ever invoked on a single item, say so instead of calling an action the server will refuse.
        cancelItem: async function (primaryControl) {
            if (primaryControl.data.entity.getEntityName() === "slcrm_referralitem") {
                await Xrm.Navigation.openAlertDialog({
                    text: "A single item cannot be cancelled. Open the referral and use Cancel Referral instead."
                });
                return;
            }

            return openLifecycleDialog(primaryControl, "Cancel", "Cancel referral");
        }
    };
})();

