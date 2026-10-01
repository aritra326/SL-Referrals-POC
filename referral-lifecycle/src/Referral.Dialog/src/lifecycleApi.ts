import { TargetTable } from "./dialogActions";

/** The browser's fetch, or a fake in tests. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** One authority the server says the item may be sent onward to. */
export interface EligibleAuthorityOption {
    id: string;
    name: string;
    level: string;
    rank: number;
}

export interface RecordContext {
    /** For example the item number. */
    heading: string;
    /** For example the referral the item belongs to. */
    subheading: string;
    status: string;
}

/** An error from the server, split into the code (SLR-...) and the sentence meant for the user. */
export class LifecycleError extends Error {
    public readonly code: string;
    public readonly userMessage: string;

    constructor(code: string, userMessage: string) {
        super(code ? `${code}: ${userMessage}` : userMessage);
        this.code = code;
        this.userMessage = userMessage;
    }
}

const API_ROOT = "/api/data/v9.2/";

const TABLES: Record<TargetTable, { entitySet: string; apiName: string }> = {
    slcrm_referralitem: { entitySet: "slcrm_referralitems", apiName: "slcrm_ExecuteReferralItemAction" },
    slcrm_referralrequest: { entitySet: "slcrm_referralrequests", apiName: "slcrm_ExecuteReferralRequestAction" },
};

const STATUS_ANNOTATION = "@OData.Community.Display.V1.FormattedValue";

/** Plug-in errors look like "SLR-STATUS-409: message". Anything else is shown as it is. */
export function parseServerMessage(raw: string): { code: string; message: string } {
    const match = /^((?:SLR|CONFIG)-[A-Z0-9-]+):\s*([\s\S]*)$/.exec(raw || "");
    return match ? { code: match[1], message: match[2] } : { code: "", message: raw || "" };
}

async function readErrorMessage(response: Response): Promise<string> {
    try {
        const body = await response.json();
        return (body && body.error && body.error.message) || "";
    } catch {
        return "";
    }
}

function toLifecycleError(raw: string, status: number): LifecycleError {
    const parsed = parseServerMessage(raw);
    if (parsed.code || parsed.message) {
        return new LifecycleError(parsed.code, parsed.message || "The action could not be completed.");
    }
    return new LifecycleError("", `The action could not be completed (error ${status}). Try again, or ask an administrator.`);
}

function clean(id: string): string {
    return (id || "").replace(/[{}]/g, "");
}

/** Calls the bound Custom API. Resolves with the id of the affected record; rejects with a LifecycleError. */
export async function runAction(
    fetchFn: FetchLike,
    baseUrl: string,
    target: TargetTable,
    recordId: string,
    actionName: string,
    comment: string,
    newAuthorityId?: string
): Promise<string> {
    const table = TABLES[target];
    const body: Record<string, string> = { ActionName: actionName };
    if (comment.trim().length > 0) {
        body.Comment = comment.trim();
    }
    if (newAuthorityId) {
        body.NewAuthorityId = clean(newAuthorityId);
    }

    let response: Response;
    try {
        response = await fetchFn(
            `${baseUrl}${API_ROOT}${table.entitySet}(${clean(recordId)})/Microsoft.Dynamics.CRM.${table.apiName}`,
            {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", Accept: "application/json", "OData-Version": "4.0" },
                body: JSON.stringify(body),
            }
        );
    } catch {
        throw new LifecycleError("", "The server could not be reached. Check your connection and try again.");
    }

    if (!response.ok) {
        throw toLifecycleError(await readErrorMessage(response), response.status);
    }

    if (response.status === 204) {
        return clean(recordId);
    }
    const result = await response.json();
    return clean(result && result.ResultRecordId) || clean(recordId);
}

/** Reads what the dialog shows above the comment box. Failure to read context is not fatal to the dialog. */
export async function loadContext(
    fetchFn: FetchLike,
    baseUrl: string,
    target: TargetTable,
    recordId: string
): Promise<RecordContext> {
    const table = TABLES[target];
    const query =
        target === "slcrm_referralitem"
            ? "?$select=slcrm_referralitemnumber,slcrm_itemsummary,statuscode&$expand=slcrm_Referral($select=slcrm_name)"
            : "?$select=slcrm_name,statuscode";

    const response = await fetchFn(`${baseUrl}${API_ROOT}${table.entitySet}(${clean(recordId)})${query}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json", Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' },
    });
    if (!response.ok) {
        throw toLifecycleError(await readErrorMessage(response), response.status);
    }

    const row = await response.json();
    const status = row[`statuscode${STATUS_ANNOTATION}`] || "";

    if (target === "slcrm_referralitem") {
        return {
            heading: row.slcrm_referralitemnumber || row.slcrm_itemsummary || "Referral item",
            subheading: (row.slcrm_Referral && row.slcrm_Referral.slcrm_name) || "",
            status,
        };
    }
    return { heading: row.slcrm_name || "Referral", subheading: "", status };
}

/** Asks the server which authorities the item can be sent onward to. The server applies the real eligibility rules. */
export async function loadEligibleAuthorities(
    fetchFn: FetchLike,
    baseUrl: string,
    itemId: string
): Promise<EligibleAuthorityOption[]> {
    let response: Response;
    try {
        response = await fetchFn(
            `${baseUrl}${API_ROOT}slcrm_referralitems(${clean(itemId)})/Microsoft.Dynamics.CRM.slcrm_GetEligibleAuthorities`,
            {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", Accept: "application/json", "OData-Version": "4.0" },
                body: "{}",
            }
        );
    } catch {
        throw new LifecycleError("", "The server could not be reached. Check your connection and try again.");
    }

    if (!response.ok) {
        throw toLifecycleError(await readErrorMessage(response), response.status);
    }

    const result = await response.json();
    try {
        return JSON.parse((result && result.AuthoritiesJson) || "[]") as EligibleAuthorityOption[];
    } catch {
        throw new LifecycleError("", "The list of authorities could not be read.");
    }
}
