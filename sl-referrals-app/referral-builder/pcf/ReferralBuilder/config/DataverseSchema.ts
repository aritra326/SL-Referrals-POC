/**
 * Every Dataverse name the Referral Builder depends on lives here.
 *
 * Two naming systems are in play and they are NOT interchangeable:
 *  - logicalName  -> what webAPI.createRecord / retrieveMultipleRecords take
 *  - entitySet    -> what goes inside an @odata.bind URL
 *  - navProperty  -> the LEFT side of an @odata.bind, which is the attribute's
 *                    SchemaName (TitleCase), not its lowercase logical name.
 *
 * The navProperty casing below was read from live metadata
 * (EntityDefinitions/Attributes/LookupAttributeMetadata?$select=SchemaName), not guessed.
 * Note the deliberate inconsistency: Referral Request uses `slcrm_CountryofReferral`
 * (lowercase "of") while Referral Reason uses `slcrm_CountryOfReferral`.
 */

export const Tables = {
    ReferralRequest: { logicalName: "slcrm_referralrequest", entitySet: "slcrm_referralrequests", idField: "slcrm_referralrequestid" },
    ReferralItem: { logicalName: "slcrm_referralitem", entitySet: "slcrm_referralitems", idField: "slcrm_referralitemid" },
    ReferralReason: { logicalName: "slcrm_referralreason", entitySet: "slcrm_referralreasons", idField: "slcrm_referralreasonid" },
    CoverSection: { logicalName: "slcrm_coversection", entitySet: "slcrm_coversections", idField: "slcrm_coversectionid" },
    AuthorityLevel: { logicalName: "slcrm_authoritylevel", entitySet: "slcrm_authoritylevels", idField: "slcrm_authoritylevelid" },
    UnderwriterAuthority: { logicalName: "slcrm_underwriterauthority", entitySet: "slcrm_underwriterauthorities", idField: "slcrm_underwriterauthorityid" },
    Product: { logicalName: "slcrm_product", entitySet: "slcrm_products", idField: "slcrm_productid" },
    Country: { logicalName: "slcrm_country", entitySet: "slcrm_countries", idField: "slcrm_countryid" },
    Opportunity: { logicalName: "opportunity", entitySet: "opportunities", idField: "opportunityid" },
    Account: { logicalName: "account", entitySet: "accounts", idField: "accountid" },
    SystemUser: { logicalName: "systemuser", entitySet: "systemusers", idField: "systemuserid" },
    Policy: { logicalName: "slcrm_policy", entitySet: "slcrm_policies", idField: "slcrm_policyid" },
    Rational: { logicalName: "slcrm_rational", entitySet: "slcrm_rationals", idField: "slcrm_rationalid" },
} as const;

/** Policy (the renewal term a Rationale is written against). */
export const Policy = {
    name: "slcrm_name", // Policy Reference — the lineage key shared across renewal years
    inceptionDate: "slcrm_inceptiondate",
    nav: {
        opportunity: "slcrm_Opportunity",
        customer: "slcrm_CustomerInsured",
        broker: "slcrm_Broker",
        product: "slcrm_Product",
    },
} as const;

/**
 * Rationale ("slcrm_rational" — table name predates this feature and was not
 * renamed to avoid touching every existing reference to it).
 *
 * `copyableFields` are the narrative columns the Copy Rationale page actually
 * copies from a source record — see CopyRationaleApp. Everything else on the
 * table (Underwriter, Status, Version, lineage fields) is assigned fresh on
 * the new record rather than copied, per the source concept: a copy reuses
 * the underwriting narrative, not the previous year's metadata.
 */
export const Rational = {
    name: "slcrm_name",
    policyReference: "slcrm_policyreference",
    renewalYear: "slcrm_renewalyear",
    version: "slcrm_version",
    status: "slcrm_status",
    isCurrent: "slcrm_iscurrent",
    copiedOn: "slcrm_copiedon",
    copyableFields: [
        "slcrm_capacityconsiderations",
        "slcrm_captivearrangements",
        "slcrm_claimsexperience",
        "slcrm_licencelevel",
        "slcrm_negotiationoutcomestext",
        "slcrm_overseasterritoryexposures",
        "slcrm_ppmcategory",
        "slcrm_pricing",
        "slcrm_qualityassessmenttext",
        "slcrm_riskmanagementarrangements",
        "slcrm_sanctionsconsiderations",
        "slcrm_underwriteropinion",
    ] as const,
    nav: {
        opportunity: "slcrm_Opportunity",
        policy: "slcrm_Policy",
        customer: "slcrm_CustomerInsured",
        underwriter: "slcrm_Underwriter",
        sourceRational: "slcrm_SourceRational",
        copiedBy: "slcrm_CopiedBy",
    },
} as const;

/** slcrm_rational's slcrm_status choice (added for the Copy Rationale feature). */
export const RationalStatus = { draft: 100000000, final: 100000001 } as const;

/** Referral Request (the parent). */
export const ReferralRequest = {
    name: "slcrm_name",
    description: "slcrm_commonbusinessriskdescription",
    inceptionDate: "slcrm_inceptioneffectivedate",
    priority: "slcrm_priority",
    policyType: "slcrm_policytype",
    sourceSystem: "slcrm_sourcesystem",
    hasEverBeenSubmitted: "slcrm_haseverbeensubmitted",
    submittedOn: "slcrm_submittedon",
    lastSubmittedOn: "slcrm_lastsubmittedon",
    // Navigation properties (left side of @odata.bind)
    nav: {
        opportunity: "slcrm_Opportunity",
        product: "slcrm_Product",
        customer: "slcrm_CustomerInsured",
        broker: "slcrm_Broker",
        primaryUnderwriter: "slcrm_PrimaryUnderwriter",
        country: "slcrm_CountryofReferral",
        submittedBy: "slcrm_SubmittedBy",
    },
} as const;

/** Referral Item (the child). */
export const ReferralItem = {
    itemSummary: "slcrm_itemsummary",
    referralDetails: "slcrm_referraldetails",
    underwriterRationale: "slcrm_underwriterrationale",
    logicalItemId: "slcrm_logicalitemid",
    isCurrentRevision: "slcrm_iscurrentrevision",
    revisionNumber: "slcrm_revisionnumber",
    sequence: "slcrm_sequence",
    nav: {
        referral: "slcrm_Referral",
        coverSection: "slcrm_CoverSection",
        referralReason: "slcrm_ReferralReason",
        product: "slcrm_Product",
        requiredAuthorityLevel: "slcrm_RequiredAuthorityLevel",
        underwriterAuthority: "slcrm_UnderwriterAuthority",
        assignedApprover: "slcrm_AssignedApprover",
    },
} as const;

/**
 * Status reasons. Values are environment-specific (this publisher's option prefix
 * is 63365) and were read from live metadata. The builder only ever writes Draft;
 * the transition to Submitted is done server-side by the lifecycle Custom API.
 */
export const StatusReason = {
    referralRequest: { draft: 633650001, sentForApproval: 633650002 },
    referralItem: { draft: 633650001, submitted: 633650002 },
    underwriterAuthorityCurrent: 633650001,
} as const;

export const State = { active: 0, inactive: 1 } as const;

/** Choice values used on create. */
export const Choices = {
    priority: { high: 633650000, medium: 633650001, low: 633650002 },
    policyType: { annual: 633650000, project: 633650001, lta: 633650002 },
    sourceSystem: { crm: 633650000, imported: 633650001, integrated: 633650002 },
} as const;

/** Custom API used for the server-validated submit transition. */
export const Actions = {
    executeReferralRequestAction: "slcrm_ExecuteReferralRequestAction",
} as const;
