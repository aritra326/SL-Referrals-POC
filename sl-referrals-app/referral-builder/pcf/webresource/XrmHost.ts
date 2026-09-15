/**
 * Host shim that lets the ReferralBuilder React app run as a plain HTML web
 * resource instead of inside a PCF.
 *
 * Why this exists
 * ---------------
 * The same app was first hosted on a model-driven Custom Page. A custom page is
 * a canvas app rendered in a nested iframe, and Microsoft documents that it
 * "requires third-party cookies to be enabled, which is required by the canvas
 * app runtime" (Known issues with custom pages in a model-driven app). With
 * third-party cookies blocked — Chrome's current default, always the case in
 * incognito, and frequently enforced by tenant policy — the canvas runtime's
 * silent token refresh fails and the page never reliably renders.
 *
 * An HTML web resource is served from the Dataverse origin itself, so Web API
 * calls are plain same-origin requests authenticated by the user's existing
 * session cookie. No second token, no iframe auth, nothing to configure in the
 * browser.
 *
 * The app only ever touches three host surfaces (webAPI, userSettings.userId,
 * navigation.openForm), so this shim implements exactly those and the component
 * tree is reused unchanged.
 */

import { Tables } from "../ReferralBuilder/config/DataverseSchema";

type Entity = ComponentFramework.WebApi.Entity;

const API_PATH = "/api/data/v9.2";

/** Ask for formatted values so lookups can render display names without a second round trip. */
const ANNOTATIONS = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The platform Xrm object, if we are running inside the model-driven app shell.
 * Absent when the page is opened standalone by URL, which is a supported case —
 * everything below degrades to same-origin fetch.
 */
function getXrm(): any | undefined {
    const w = window as any;
    if (w.Xrm?.Utility) return w.Xrm;
    try {
        if (w.parent && w.parent !== w && w.parent.Xrm?.Utility) return w.parent.Xrm;
    } catch {
        /* cross-origin parent — ignore and fall back to fetch */
    }
    return undefined;
}

/**
 * Base URL for the Web API. Online orgs serve web resources from the root so a
 * relative path is correct, but deriving it from the global context when it is
 * available keeps this honest for orgs served under a path prefix.
 */
function getClientUrl(): string {
    try {
        const ctx = getXrm()?.Utility?.getGlobalContext?.();
        const url = ctx?.getClientUrl?.();
        if (typeof url === "string" && url) return url.replace(/\/$/, "");
    } catch {
        /* fall through */
    }
    return "";
}

/** logicalName -> entitySet, taken from the schema module that already tracks both. */
const ENTITY_SETS: Record<string, string> = Object.values(Tables).reduce(
    (acc, t) => {
        acc[t.logicalName] = t.entitySet;
        return acc;
    },
    {} as Record<string, string>
);

const resolvedSets = new Map<string, string>();

/**
 * Resolves the OData entity set for a logical name. Known tables come from the
 * schema module; anything else is looked up from metadata once and cached, so a
 * table added later still works rather than silently 404ing.
 */
async function entitySetFor(logicalName: string): Promise<string> {
    const known = ENTITY_SETS[logicalName];
    if (known) return known;

    const cached = resolvedSets.get(logicalName);
    if (cached) return cached;

    const meta = await request<{ EntitySetName: string }>(
        "GET",
        `/EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName`
    );
    const set = meta?.EntitySetName;
    if (!set) throw new Error(`Could not resolve the entity set for '${logicalName}'.`);
    resolvedSets.set(logicalName, set);
    return set;
}

interface RawResponse<T> {
    body: T;
    headers: Headers;
}

async function rawRequest<T>(method: string, path: string, body?: unknown): Promise<RawResponse<T>> {
    const res = await fetch(`${getClientUrl()}${API_PATH}${path}`, {
        method,
        // The session cookie is what authenticates us; this is a same-origin call.
        credentials: "same-origin",
        headers: {
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            Accept: "application/json",
            "Content-Type": "application/json; charset=utf-8",
            Prefer: ANNOTATIONS,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
        // Surface the server's own message — DataverseService.toFriendlyError
        // reads it to decide what the underwriter should be told.
        let message = `${res.status} ${res.statusText}`;
        try {
            const text = await res.text();
            if (text) {
                const parsed = JSON.parse(text) as { error?: { message?: string } };
                message = parsed?.error?.message ?? text;
            }
        } catch {
            /* keep the status-line message */
        }
        throw new Error(message);
    }

    const text = res.status === 204 ? "" : await res.text();
    return { body: (text ? JSON.parse(text) : undefined) as T, headers: res.headers };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await rawRequest<T>(method, path, body)).body;
}

/** Pulls the new record's id out of the OData-EntityId response header. */
function idFromEntityIdHeader(headers: Headers): string {
    const header = headers.get("OData-EntityId") ?? "";
    const match = /\(([0-9a-fA-F-]{36})\)/.exec(header);
    if (!match) throw new Error("The record was created but its id could not be read from the response.");
    return match[1];
}

/**
 * Implements the subset of ComponentFramework.WebApi the app actually calls,
 * with the same signatures, so DataverseService needs no changes.
 */
const webAPI = {
    async retrieveMultipleRecords(
        entityLogicalName: string,
        options?: string
    ): Promise<ComponentFramework.WebApi.RetrieveMultipleResponse> {
        const set = await entitySetFor(entityLogicalName);
        const result = await request<{ value: Entity[] }>("GET", `/${set}${options ?? ""}`);
        return { entities: result?.value ?? [], nextLink: "" };
    },

    async retrieveRecord(entityLogicalName: string, id: string, options?: string): Promise<Entity> {
        const set = await entitySetFor(entityLogicalName);
        return await request<Entity>("GET", `/${set}(${clean(id)})${options ?? ""}`);
    },

    async createRecord(
        entityLogicalName: string,
        data: Entity
    ): Promise<ComponentFramework.LookupValue> {
        const set = await entitySetFor(entityLogicalName);
        const res = await rawRequest<unknown>("POST", `/${set}`, data);
        return { id: idFromEntityIdHeader(res.headers), name: "", entityType: entityLogicalName };
    },

    async updateRecord(
        entityLogicalName: string,
        id: string,
        data: Entity
    ): Promise<ComponentFramework.LookupValue> {
        const set = await entitySetFor(entityLogicalName);
        await request<unknown>("PATCH", `/${set}(${clean(id)})`, data);
        return { id: clean(id), name: "", entityType: entityLogicalName };
    },

    async deleteRecord(
        entityLogicalName: string,
        id: string
    ): Promise<ComponentFramework.LookupValue> {
        const set = await entitySetFor(entityLogicalName);
        await request<unknown>("DELETE", `/${set}(${clean(id)})`);
        return { id: clean(id), name: "", entityType: entityLogicalName };
    },
};

const clean = (id: string): string => (id ?? "").replace(/[{}]/g, "");

/** The signed-in user's systemuserid, via WhoAmI. */
export async function resolveUserId(): Promise<string> {
    try {
        const who = await request<{ UserId: string }>("GET", "/WhoAmI()");
        return clean(who?.UserId ?? "");
    } catch {
        // A missing user id only costs us the "submitted by" default; it must
        // not stop the page rendering.
        return "";
    }
}

/**
 * Opens a record. Uses the app's own navigation when we are hosted inside it so
 * the user stays in the shell; falls back to a top-level URL otherwise.
 */
const navigation = {
    openForm(options: { entityName?: string; entityId?: string }): void {
        const xrm = getXrm();
        if (xrm?.Navigation?.openForm) {
            void xrm.Navigation.openForm(options);
            return;
        }

        const appId = new URLSearchParams(window.location.search).get("appid");
        const parts = [
            appId ? `appid=${encodeURIComponent(appId)}` : "",
            "pagetype=entityrecord",
            `etn=${encodeURIComponent(options.entityName ?? "")}`,
            options.entityId ? `id=${encodeURIComponent(clean(options.entityId))}` : "",
        ].filter(Boolean);

        const url = `${getClientUrl()}/main.aspx?${parts.join("&")}`;
        try {
            (window.top ?? window).location.href = url;
        } catch {
            window.location.href = url;
        }
    },
};

/**
 * A stand-in for ComponentFramework.Context carrying only what the app reads.
 * Shaped as the real context so ReferralBuilderApp is identical in both hosts.
 */
export function createHostContext(userId: string): ComponentFramework.Context<unknown> {
    return { webAPI, userSettings: { userId }, navigation } as unknown as ComponentFramework.Context<unknown>;
}
