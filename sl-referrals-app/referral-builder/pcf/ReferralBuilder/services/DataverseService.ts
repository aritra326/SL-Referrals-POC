/**
 * Thin wrapper over the PCF WebAPI. Everything runs under the signed-in user's
 * own Dataverse security context — this layer adds no privilege of its own.
 */
export class DataverseService {
    constructor(private readonly webApi: ComponentFramework.WebApi) {}

    public async retrieveMultiple<T = ComponentFramework.WebApi.Entity>(
        logicalName: string,
        options: string
    ): Promise<T[]> {
        const result = await this.webApi.retrieveMultipleRecords(logicalName, options);
        return (result.entities ?? []) as unknown as T[];
    }

    public async retrieve<T = ComponentFramework.WebApi.Entity>(
        logicalName: string,
        id: string,
        options: string
    ): Promise<T> {
        return (await this.webApi.retrieveRecord(logicalName, id, options)) as unknown as T;
    }

    public async create(
        logicalName: string,
        data: ComponentFramework.WebApi.Entity
    ): Promise<string> {
        const ref = await this.webApi.createRecord(logicalName, data);
        return stripBraces(ref.id);
    }

    public async update(
        logicalName: string,
        id: string,
        data: ComponentFramework.WebApi.Entity
    ): Promise<void> {
        await this.webApi.updateRecord(logicalName, id, data);
    }
}

export const stripBraces = (id: string): string => (id ?? "").replace(/[{}]/g, "");

/** Builds an @odata.bind value: "/entitySet(guid)". */
export const bindTo = (entitySet: string, id: string): string =>
    `/${entitySet}(${stripBraces(id)})`;

/**
 * Turns a raw Dataverse/plugin error into something an underwriter can act on.
 * The original is preserved on `.cause` for the console.
 */
export function toFriendlyError(err: unknown, fallback: string): Error {
    const raw =
        (err as { message?: string })?.message ??
        (typeof err === "string" ? err : "") ??
        "";

    let message = fallback;

    if (/privilege|access is denied|insufficient/i.test(raw)) {
        message =
            "You do not have permission to create referrals. Ask an administrator to check your security role " +
            "(Create, Read, Append and Append To are all needed on Referral Request and Referral Item).";
    } else if (/duplicate/i.test(raw)) {
        message = "A matching referral item already exists on this referral. Change the reason or cover and try again.";
    } else if (/timeout|timed out/i.test(raw)) {
        message = "The request timed out before it completed. Check Referrals before trying again — it may have saved.";
    } else if (raw && raw.length < 240 && !/0x[0-9a-f]{8}/i.test(raw)) {
        // Short, non-hex-coded server messages are usually already meaningful.
        message = raw;
    }

    const e = new Error(message);
    (e as Error & { cause?: unknown }).cause = err;
    return e;
}
