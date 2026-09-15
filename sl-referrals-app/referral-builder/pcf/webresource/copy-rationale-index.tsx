/**
 * Entry point for the Copy Rationale web resource.
 *
 * Same same-origin pattern as index.tsx (see XrmHost.ts for why): launched
 * from the Opportunity command bar as ?entityName=opportunity&recordId=<id>,
 * bundled into the `data` query parameter the platform actually sends for a
 * web-resource ribbon action.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { CopyRationaleApp } from "../ReferralBuilder/components/CopyRationaleApp";
import { ErrorBoundary } from "../ReferralBuilder/components/ErrorBoundary";
import { createHostContext, resolveUserId } from "./XrmHost";

function param(name: string): string {
    return new URLSearchParams(window.location.search).get(name) ?? "";
}

function launchParam(name: string): string {
    const direct = param(name);
    if (direct) return direct;

    const data = param("data");
    if (!data) return "";
    try {
        return new URLSearchParams(decodeURIComponent(data)).get(name) ?? "";
    } catch {
        return "";
    }
}

function renderFatal(container: HTMLElement, message: string): void {
    container.innerHTML = "";
    const box = document.createElement("div");
    box.setAttribute(
        "style",
        "font-family:'Segoe UI',system-ui,sans-serif;padding:24px;color:#a80000;" +
            "max-width:680px;margin:48px auto;border:1px solid #f3d6d6;border-radius:8px;background:#fdf6f6"
    );
    box.textContent = message;
    container.appendChild(box);
}

async function start(): Promise<void> {
    const container = document.getElementById("root");
    if (!container) return;

    const opportunityId = launchParam("recordId");
    if (!opportunityId) {
        renderFatal(container, "This page needs to be opened from an Opportunity (no record id was supplied).");
        return;
    }

    try {
        const userId = await resolveUserId();

        ReactDOM.render(
            React.createElement(
                ErrorBoundary,
                null,
                React.createElement(CopyRationaleApp, {
                    context: createHostContext(userId),
                    opportunityId,
                    currentUserId: userId,
                })
            ),
            container
        );
    } catch (err) {
        console.error("Copy Rationale failed to start", err);
        renderFatal(
            container,
            "Copy Rationale could not start. Refresh the page, and if it keeps happening check that you have " +
                "read access to Policy and Rationale."
        );
    }
}

void start();
