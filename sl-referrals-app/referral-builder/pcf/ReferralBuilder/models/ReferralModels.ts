/** A selectable reference record reduced to what the UI needs. */
export interface LookupOption {
    id: string;
    label: string;
    /** Optional grouping/filter key, e.g. the product a cover section belongs to. */
    parentId?: string;
    /** Optional sort/comparison value, e.g. an authority level's comparison rank. */
    rank?: number;
    /** Optional secondary line shown under the label. */
    secondary?: string;
}

/** Context resolved from an Opportunity (or another source record). */
export interface SourceContext {
    opportunityId?: string;
    opportunityName?: string;
    customerId?: string;
    customerName?: string;
    brokerId?: string;
    brokerName?: string;
}

/** One row in the Referral Items repeater. Exists only in React state until save. */
export interface ReferralItemDraft {
    /** Client-side key so rows can be added/removed before they exist in Dataverse. */
    clientKey: string;
    referralReasonId?: string;
    coverSectionId?: string;
    rationale: string;
    requiredAuthorityLevelId?: string;
    underwriterAuthorityId?: string;
}

/** The whole unsaved referral. */
export interface ReferralDraft {
    opportunityId?: string;
    productId?: string;
    customerId?: string;
    brokerId?: string;
    countryId?: string;
    priority: number;
    policyType: number;
    inceptionDate?: string;
    description: string;
    items: ReferralItemDraft[];
}

export interface ValidationErrors {
    context: Record<string, string>;
    /** Keyed by ReferralItemDraft.clientKey. */
    items: Record<string, Record<string, string>>;
}

export interface SaveResult {
    referralRequestId: string;
    referralNumber?: string;
    itemCount: number;
    submitted: boolean;
}

export const newItemDraft = (): ReferralItemDraft => ({
    clientKey: `k${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    rationale: "",
});
