"use strict";

/**
 * Command handlers for the Opportunity form command bar.
 *
 * "Copy Rationale" opens the Copy Rationale web resource (see
 * webresource/copy-rationale-index.tsx) as a centered dialog, passing the
 * current Opportunity's id. Using navigateTo's webresource page type keeps
 * this same-origin and in-context, rather than opening a new browser tab.
 */
// eslint-disable-next-line no-unused-vars
var slcrm_OpportunityCommands = (function () {
    function openCopyRationale(primaryControl) {
        var opportunityId = primaryControl && primaryControl.data && primaryControl.data.entity
            ? primaryControl.data.entity.getId()
            : null;
        if (!opportunityId) return;
        opportunityId = opportunityId.replace(/[{}]/g, "");

        Xrm.Navigation.navigateTo(
            {
                pageType: "webresource",
                webresourceName: "slcrm_copyrationale.html",
                data: "recordId=" + opportunityId + "&entityName=opportunity",
            },
            {
                target: 2, // dialog
                position: 1, // centered
                width: { value: 920, unit: "px" },
                height: { value: 760, unit: "px" },
                title: "Copy Rationale",
            }
        ).catch(function (err) {
            // If the dialog itself can't open (old client, blocked popups), at
            // least tell the underwriter why nothing happened.
            if (window.Xrm && Xrm.Navigation && Xrm.Navigation.openAlertDialog) {
                Xrm.Navigation.openAlertDialog({ text: "Copy Rationale could not open: " + (err && err.message ? err.message : err) });
            }
        });
    }

    return { openCopyRationale: openCopyRationale };
})();
