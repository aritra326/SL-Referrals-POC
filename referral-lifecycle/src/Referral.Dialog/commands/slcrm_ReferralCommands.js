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
        // Anything not listed here (for example Onward, which needs an authority picker) still uses the custom page.
        decisionDialogPage: "slcrm_referraldecision.html",
        decisionDialogActions: [
            "slcrm_referralitem:Authorise",
            "slcrm_referralitem:Reject",
            "slcrm_referralitem:AuthoriseWithRecommendations",
            "slcrm_referralitem:RequestInformation",
            "slcrm_referralrequest:CompleteRejected",
            "slcrm_referralrequest:CompletePartial",
            "slcrm_referralrequest:Cancel"
        ]
    };

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

    async function saveAndGetContext(primaryControl) {
        const form = primaryControl;

        if (!form || !form.data || !form.data.entity) {
            throw new Error("This command must be run from a Referral Request or Referral Item form.");
        }

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
            const context = await saveAndGetContext(primaryControl);
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
            const context = await saveAndGetContext(primaryControl);

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
        cancelItem: function (primaryControl) {
            return openLifecycleDialog(primaryControl, "Cancel", "Cancel referral item");
        }
    };
})();

