/**
 * Entry point of the decision dialog web resource.
 *
 * Opened from the command bar with navigateTo (see commands/slcrm_ReferralCommands.js) as
 * ?data=recordId=<guid>&entityName=<table>&actionName=<action>, the same pattern the Copy Rationale page uses.
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import { DecisionDialog } from "./DecisionDialog";
import { findAction, TargetTable } from "./dialogActions";
import { loadContext, runAction } from "./lifecycleApi";

function launchParams(search: string): URLSearchParams {
    const outer = new URLSearchParams(search);
    const data = outer.get("data");
    return data ? new URLSearchParams(decodeURIComponent(data)) : outer;
}

/** Closes the dialog the command bar opened. The command then refreshes the form it was opened from. */
export function closeDialog(win: Window): void {
    try {
        const xrm = (win.parent as unknown as { Xrm?: { Navigation?: { navigateBack?: () => void } } }).Xrm;
        if (xrm && xrm.Navigation && xrm.Navigation.navigateBack) {
            xrm.Navigation.navigateBack();
            return;
        }
    } catch {
        // Fall through to window.close when the parent is not reachable.
    }
    win.close();
}

function showProblem(container: HTMLElement, message: string): void {
    container.textContent = message;
    container.className = "fatal";
}

function start(): void {
    const container = document.getElementById("root");
    if (!container) {
        return;
    }

    const params = launchParams(window.location.search);
    const recordId = params.get("recordId") || "";
    const target = params.get("entityName") || "";
    const action = findAction(target, params.get("actionName") || "");

    if (!recordId || !action) {
        showProblem(container, "This dialog must be opened from a referral or referral item command.");
        return;
    }

    const baseUrl = window.location.origin;
    const fetchFn = window.fetch.bind(window);

    ReactDOM.render(
        <DecisionDialog
            action={action}
            loadContext={() => loadContext(fetchFn, baseUrl, target as TargetTable, recordId)}
            submit={async (comment) => {
                await runAction(fetchFn, baseUrl, target as TargetTable, recordId, action.name, comment);
            }}
            onFinished={() => closeDialog(window)}
        />,
        container
    );
}

if (typeof document !== "undefined" && document.getElementById("root")) {
    start();
}
