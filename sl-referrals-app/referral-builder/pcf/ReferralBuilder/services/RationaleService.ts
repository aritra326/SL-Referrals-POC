import { DataverseService, bindTo, stripBraces, toFriendlyError } from "./DataverseService";
import { Tables, Opportunity, Rational, RationalStatus } from "../config/DataverseSchema";

/** One prior year's rationale, as shown in the "pick one to copy" list. */
export interface RationaleOption {
    id: string;
    name: string;
    renewalYear: number | null;
    underwriterName: string;
    statusLabel: string;
    modifiedOn: string;
    /** Narrative fields, keyed by logical name — what Preview shows and Copy copies. */
    fields: Record<string, string>;
}

export interface PolicyContext {
    policyId: string;
    policyReference: string;
    customerId: string;
    customerName: string;
}

/**
 * Data access + the copy operation for the Copy Rationale page.
 *
 * Data model: Policy 1:N Opportunity (one Opportunity per renewal, via
 * Opportunity.slcrm_Policy) and Opportunity 1:N Rationale. "Same policy"
 * history is therefore every Final Rationale whose Opportunity points at the
 * same Policy as the current Opportunity.
 */
export class RationaleService {
    constructor(private readonly dv: DataverseService) {}

    /** Resolves the Policy (and its Policy Reference / customer) linked to an Opportunity, if any. */
    public async loadPolicyForOpportunity(opportunityId: string): Promise<PolicyContext | null> {
        const opps = await this.dv.retrieveMultiple<Record<string, string | undefined>>(
            Tables.Opportunity.logicalName,
            `?$select=${Opportunity.policyValue}&$filter=opportunityid eq ${stripBraces(opportunityId)}&$top=1`
        );
        const policyId = stripBraces(opps[0]?.[Opportunity.policyValue] ?? "");
        if (!policyId) return null;

        const rows = await this.dv.retrieveMultiple<{
            slcrm_policyid: string;
            slcrm_name: string;
            _slcrm_customerinsured_value?: string;
            "_slcrm_customerinsured_value@OData.Community.Display.V1.FormattedValue"?: string;
        }>(
            Tables.Policy.logicalName,
            // Selecting a lookup's id needs the "_field_value" wrapped form —
            // the bare attribute name 404s ("Could not find a property named").
            `?$select=slcrm_policyid,slcrm_name,_slcrm_customerinsured_value` +
                `&$filter=slcrm_policyid eq ${policyId}` +
                `&$top=1`
        );
        const row = rows[0];
        if (!row) return null;

        return {
            policyId: row.slcrm_policyid,
            policyReference: row.slcrm_name ?? "",
            customerId: stripBraces(row._slcrm_customerinsured_value ?? ""),
            customerName: row["_slcrm_customerinsured_value@OData.Community.Display.V1.FormattedValue"] ?? "",
        };
    }

    /**
     * Every Final rationale that shares the given Policy Reference, excluding
     * whatever is already on the current opportunity. Newest renewal year first.
     */
    public async loadCopyableRationales(policyId: string, excludeOpportunityId: string): Promise<RationaleOption[]> {
        if (!policyId) return [];

        const select = [
            "slcrm_rationalid",
            "slcrm_name",
            Rational.renewalYear,
            Rational.status,
            "modifiedon",
            "_slcrm_underwriter_value",
            ...Rational.copyableFields,
        ].join(",");

        const filter =
            `${Rational.nav.opportunity}/${Opportunity.policyValue} eq ${stripBraces(policyId)}` +
            ` and ${Rational.status} eq ${RationalStatus.final}` +
            ` and _slcrm_opportunity_value ne ${stripBraces(excludeOpportunityId)}`;

        const rows = await this.dv.retrieveMultiple<Record<string, unknown>>(
            Tables.Rational.logicalName,
            `?$select=${select}&$filter=${filter}&$orderby=${Rational.renewalYear} desc`
        );

        return rows.map((row) => ({
            id: String(row.slcrm_rationalid),
            name: String(row.slcrm_name ?? "Rationale"),
            renewalYear: (row[Rational.renewalYear] as number | null) ?? null,
            underwriterName:
                (row["_slcrm_underwriter_value@OData.Community.Display.V1.FormattedValue"] as string) ?? "Unassigned",
            statusLabel: row[Rational.status] === RationalStatus.final ? "Final" : "Draft",
            modifiedOn: String(row.modifiedon ?? ""),
            fields: Object.fromEntries(Rational.copyableFields.map((f) => [f, String(row[f] ?? "")])),
        }));
    }

    /**
     * Creates a brand-new Rationale for `targetOpportunityId`, either blank
     * ("start from scratch") or seeded from `source` ("copy"). The source
     * record itself is never modified — this is a copy, not a re-link, so the
     * prior year's rationale stays exactly as the underwriter left it.
     */
    public async createRationale(args: {
        targetOpportunityId: string;
        policy: PolicyContext;
        renewalYear: number;
        currentUserId: string;
        source?: RationaleOption; // omitted => start from scratch
    }): Promise<string> {
        const { targetOpportunityId, policy, renewalYear, currentUserId, source } = args;

        const data: ComponentFramework.WebApi.Entity = {
            [Rational.name]: source ? `Rationale — ${renewalYear} (from ${source.renewalYear ?? "prior"})` : `Rationale — ${renewalYear}`,
            [Rational.policyReference]: policy.policyReference,
            [Rational.renewalYear]: renewalYear,
            [Rational.version]: 1,
            [Rational.status]: RationalStatus.draft,
            [Rational.isCurrent]: true,
            [`${Rational.nav.opportunity}@odata.bind`]: bindTo(Tables.Opportunity.entitySet, targetOpportunityId),
            [`${Rational.nav.policy}@odata.bind`]: bindTo(Tables.Policy.entitySet, policy.policyId),
            [`${Rational.nav.underwriter}@odata.bind`]: bindTo(Tables.SystemUser.entitySet, currentUserId),
        };

        if (policy.customerId) {
            data[`${Rational.nav.customer}@odata.bind`] = bindTo(Tables.Account.entitySet, policy.customerId);
        }

        if (source) {
            data[`${Rational.nav.sourceRational}@odata.bind`] = bindTo(Tables.Rational.entitySet, source.id);
            data[`${Rational.nav.copiedBy}@odata.bind`] = bindTo(Tables.SystemUser.entitySet, currentUserId);
            data[Rational.copiedOn] = new Date().toISOString();
            for (const field of Rational.copyableFields) {
                if (source.fields[field]) data[field] = source.fields[field];
            }
        }

        try {
            return await this.dv.create(Tables.Rational.logicalName, data);
        } catch (err) {
            throw toFriendlyError(
                err,
                "The rationale could not be created. Check that you have Create access on Rationale and try again."
            );
        }
    }
}
