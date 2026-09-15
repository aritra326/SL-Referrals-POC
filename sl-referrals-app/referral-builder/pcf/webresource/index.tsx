/**
 * Entry point for the web-resource build of the Referral Builder.
 *
 * Mounts the same ReferralBuilderApp used by the PCF, against the same-origin
 * host shim. Launch context is read from the query string so the page can be
 * deep-linked from a record (?entityName=opportunity&recordId=<guid>) or opened
 * cold from navigation with no parameters at all.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import { ReferralBuilderApp } from "../ReferralBuilder/components/ReferralBuilderApp";
import { ErrorBoundary } from "../ReferralBuilder/components/ErrorBoundary";
import { createHostContext, resolveUserId } from "./XrmHost";

function param(name: string): string {
    return new URLSearchParams(window.location.search).get(name) ?? "";
}

/**
 * Model-driven apps pass web-resource parameters bundled into a single `data`
 * query value, so unpack that too rather than only reading top-level params.
 */
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

    try {
        // WhoAmI before first paint: the app needs the current user to stamp
        // "submitted by" on the draft it creates.
        const userId = await resolveUserId();

        ReactDOM.render(
            React.createElement(
                ErrorBoundary,
                null,
                React.createElement(ReferralBuilderApp, {
                    context: createHostContext(userId),
                    sourceEntityName: launchParam("entityName"),
                    sourceRecordId: launchParam("recordId"),
                    mode: launchParam("mode") || "create",
                })
            ),
            container
        );
    } catch (err) {
        console.error("Referral Builder failed to start", err);
        renderFatal(
            container,
            "The referral builder could not start. Refresh the page, and if it keeps happening " +
                "check that you have read access to Referral Reason, Cover / Section, Authority Level, " +
                "Product and Opportunity."
        );
    }
}

void start();
