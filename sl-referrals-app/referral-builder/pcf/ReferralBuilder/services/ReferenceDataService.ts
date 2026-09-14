import { Tables, StatusReason, State } from "../config/DataverseSchema";
import { DataverseService, stripBraces } from "./DataverseService";
import { LookupOption, SourceContext } from "../models/ReferralModels";

/**
 * Loads the picklists the builder needs. Every query is $select-limited —
 * never retrieve whole rows for a dropdown.
 */
export class ReferenceDataService {
    constructor(private readonly dv: DataverseService) {}

    public async loadProducts(): Promise<LookupOption[]> {
        const rows = await this.dv.retrieveMultiple(
            Tables.Product.logicalName,
            `?$select=${Tables.Product.idField},slcrm_name&$filter=statecode eq ${State.active}&$orderby=slcrm_name asc`
        );
        return rows.map((r) => ({
            id: r[Tables.Product.idField] as string,
            label: (r.slcrm_name as string) ?? "(unnamed)",
        }));
    }

    public async loadReferralReasons(): Promise<LookupOption[]> {
        const rows = await this.dv.retrieveMultiple(
            Tables.ReferralReason.logicalName,
            `?$select=${Tables.ReferralReason.idField},slcrm_name,slcrm_displayorder` +
                `&$filter=statecode eq ${State.active}&$orderby=slcrm_displayorder asc,slcrm_name asc`
        );
        return rows.map((r) => ({
            id: r[Tables.ReferralReason.idField] as string,
            label: (r.slcrm_name as string) ?? "(unnamed)",
        }));
    }

    /** Cover sections carry their product so the UI can filter without a second round trip. */
    public async loadCoverSections(): Promise<LookupOption[]> {
        const rows = await this.dv.retrieveMultiple(
            Tables.CoverSection.logicalName,
            `?$select=${Tables.CoverSection.idField},slcrm_name,slcrm_covercode,_slcrm_product_value` +
                `&$filter=statecode eq ${State.active}&$orderby=slcrm_displayorder asc,slcrm_name asc`
        );
        return rows.map((r) => ({
            id: r[Tables.CoverSection.idField] as string,
            label: (r.slcrm_name as string) ?? "(unnamed)",
            parentId: r._slcrm_product_value ? stripBraces(r._slcrm_product_value as string) : undefined,
            secondary: (r.slcrm_covercode as string) ?? undefined,
        }));
    }

    /** Only levels that can actually approve are offered as a "required" level. */
    public async loadAuthorityLevels(): Promise<LookupOption[]> {
        const rows = await this.dv.retrieveMultiple(
            Tables.AuthorityLevel.logicalName,
            `?$select=${Tables.AuthorityLevel.idField},slcrm_name,slcrm_comparisonrank,slcrm_canapprovereferrals` +
                `&$filter=statecode eq ${State.active} and slcrm_canapprovereferrals eq true` +
                `&$orderby=slcrm_comparisonrank asc`
        );
        return rows.map((r) => ({
            id: r[Tables.AuthorityLevel.idField] as string,
            label: (r.slcrm_name as string) ?? "(unnamed)",
            rank: (r.slcrm_comparisonrank as number) ?? undefined,
        }));
    }

    /**
     * Eligible approvers for a product at or above a required rank.
     *
     * This is a UX filter only. It deliberately mirrors — but does not replace —
     * the server-side eligibility check: the authority must be Current, in date,
     * for the right product, and held by an enabled user. The authoritative
     * decision is made server-side on submit.
     */
    public async loadEligibleAuthorities(
        productId: string,
        requiredRank: number,
        levels: LookupOption[]
    ): Promise<LookupOption[]> {
        if (!productId) return [];

        const today = new Date().toISOString().slice(0, 10);
        const rows = await this.dv.retrieveMultiple(
            Tables.UnderwriterAuthority.logicalName,
            `?$select=${Tables.UnderwriterAuthority.idField},slcrm_name,_slcrm_authoritylevel_value,_slcrm_underwriter_value` +
                `&$filter=statecode eq ${State.active}` +
                ` and statuscode eq ${StatusReason.underwriterAuthorityCurrent}` +
                ` and _slcrm_productclassofbusiness_value eq ${stripBraces(productId)}` +
                ` and (slcrm_effectivefrom eq null or slcrm_effectivefrom le ${today})` +
                ` and (slcrm_effectiveto eq null or slcrm_effectiveto ge ${today})` +
                `&$orderby=slcrm_name asc`
        );

        const rankById = new Map(levels.map((l) => [l.id, l.rank ?? 0]));

        return rows
            .filter((r) => {
                const levelId = r._slcrm_authoritylevel_value
                    ? stripBraces(r._slcrm_authoritylevel_value as string)
                    : "";
                const rank = rankById.get(levelId);
                return rank !== undefined && rank >= requiredRank;
            })
            .map((r) => {
                const levelId = r._slcrm_authoritylevel_value
                    ? stripBraces(r._slcrm_authoritylevel_value as string)
                    : "";
                const levelName = levels.find((l) => l.id === levelId)?.label;
                return {
                    id: r[Tables.UnderwriterAuthority.idField] as string,
                    label: (r.slcrm_name as string) ?? "(unnamed)",
                    secondary: levelName,
                    rank: rankById.get(levelId),
                };
            });
    }

    public async loadOpportunities(search?: string): Promise<LookupOption[]> {
        const term = (search ?? "").replace(/'/g, "''").trim();
        const filter = term
            ? `&$filter=statecode eq ${State.active} and contains(name,'${term}')`
            : `&$filter=statecode eq ${State.active}`;
        const rows = await this.dv.retrieveMultiple(
            Tables.Opportunity.logicalName,
            `?$select=opportunityid,name&$top=50${filter}&$orderby=name asc`
        );
        return rows.map((r) => ({
            id: r.opportunityid as string,
            label: (r.name as string) ?? "(untitled opportunity)",
        }));
    }

    public async loadCountries(): Promise<LookupOption[]> {
        const rows = await this.dv.retrieveMultiple(
            Tables.Country.logicalName,
            `?$select=${Tables.Country.idField},slcrm_name&$filter=statecode eq ${State.active}&$orderby=slcrm_name asc`
        );
        return rows.map((r) => ({
            id: r[Tables.Country.idField] as string,
            label: (r.slcrm_name as string) ?? "(unnamed)",
        }));
    }

    /**
     * Resolves customer/broker context from an Opportunity. Formatted values give
     * the display names without a second lookup per record.
     */
    public async loadOpportunityContext(opportunityId: string): Promise<SourceContext> {
        const fv = "@OData.Community.Display.V1.FormattedValue";
        const row = await this.dv.retrieve(
            Tables.Opportunity.logicalName,
            stripBraces(opportunityId),
            "?$select=opportunityid,name,_parentaccountid_value"
        );
        const rec = row as Record<string, unknown>;
        const accountId = rec._parentaccountid_value as string | undefined;
        return {
            opportunityId: stripBraces(opportunityId),
            opportunityName: rec.name as string | undefined,
            customerId: accountId ? stripBraces(accountId) : undefined,
            customerName: rec[`_parentaccountid_value${fv}`] as string | undefined,
        };
    }
}
