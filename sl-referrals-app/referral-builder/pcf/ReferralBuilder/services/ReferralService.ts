import {
    Tables,
    ReferralRequest as RR,
    ReferralItem as RI,
    StatusReason,
    Choices,
} from "../config/DataverseSchema";
import { DataverseService, bindTo, toFriendlyError } from "./DataverseService";
import { ReferralDraft, SaveResult } from "../models/ReferralModels";

/**
 * Writes the referral. The builder only ever creates records in Draft — the
 * transition to "Sent for Approval" is a server-side decision made by the
 * lifecycle Custom API, which performs the authority/eligibility validation
 * that must not be trusted to the browser.
 */
export class ReferralService {
    constructor(private readonly dv: DataverseService) {}

    public async saveDraft(draft: ReferralDraft, currentUserId: string): Promise<SaveResult> {
        const referralRequestId = await this.createParent(draft, currentUserId);

        let created = 0;
        try {
            for (let i = 0; i < draft.items.length; i++) {
                await this.createItem(draft, draft.items[i], referralRequestId, i + 1);
                created++;
            }
        } catch (err) {
            // The parent exists but the children are incomplete. Say so plainly rather
            // than pretending the save failed outright — the user must not create a
            // second referral for the same risk.
            const e = toFriendlyError(err, "The referral was created but not all items could be added.");
            e.message =
                `${e.message} The referral was saved with ${created} of ${draft.items.length} items. ` +
                `Open it from Referrals to add the rest.`;
            throw e;
        }

        const referralNumber = await this.readReferralNumber(referralRequestId);

        return {
            referralRequestId,
            referralNumber,
            itemCount: draft.items.length,
            submitted: false,
        };
    }

    private async createParent(draft: ReferralDraft, currentUserId: string): Promise<string> {
        const data: ComponentFramework.WebApi.Entity = {
            [RR.description]: draft.description,
            [RR.priority]: draft.priority,
            [RR.policyType]: draft.policyType,
            [RR.sourceSystem]: Choices.sourceSystem.crm,
            [RR.hasEverBeenSubmitted]: false,
            statuscode: StatusReason.referralRequest.draft,
        };

        if (draft.inceptionDate) data[RR.inceptionDate] = draft.inceptionDate;

        if (draft.opportunityId)
            data[`${RR.nav.opportunity}@odata.bind`] = bindTo(Tables.Opportunity.entitySet, draft.opportunityId);
        if (draft.productId)
            data[`${RR.nav.product}@odata.bind`] = bindTo(Tables.Product.entitySet, draft.productId);
        if (draft.customerId)
            data[`${RR.nav.customer}@odata.bind`] = bindTo(Tables.Account.entitySet, draft.customerId);
        if (draft.brokerId)
            data[`${RR.nav.broker}@odata.bind`] = bindTo(Tables.Account.entitySet, draft.brokerId);
        if (draft.countryId)
            data[`${RR.nav.country}@odata.bind`] = bindTo(Tables.Country.entitySet, draft.countryId);
        if (currentUserId)
            data[`${RR.nav.primaryUnderwriter}@odata.bind`] = bindTo(Tables.SystemUser.entitySet, currentUserId);

        try {
            return await this.dv.create(Tables.ReferralRequest.logicalName, data);
        } catch (err) {
            throw toFriendlyError(err, "The referral could not be created.");
        }
    }

    private async createItem(
        draft: ReferralDraft,
        item: ReferralDraft["items"][number],
        referralRequestId: string,
        sequence: number
    ): Promise<void> {
        const data: ComponentFramework.WebApi.Entity = {
            [RI.underwriterRationale]: item.rationale,
            [RI.logicalItemId]: `ITEM-${String(sequence).padStart(4, "0")}`,
            [RI.isCurrentRevision]: true,
            [RI.revisionNumber]: 1,
            [RI.sequence]: sequence,
            statuscode: StatusReason.referralItem.draft,
            [`${RI.nav.referral}@odata.bind`]: bindTo(Tables.ReferralRequest.entitySet, referralRequestId),
        };

        if (item.referralReasonId)
            data[`${RI.nav.referralReason}@odata.bind`] = bindTo(Tables.ReferralReason.entitySet, item.referralReasonId);
        if (item.coverSectionId)
            data[`${RI.nav.coverSection}@odata.bind`] = bindTo(Tables.CoverSection.entitySet, item.coverSectionId);
        if (draft.productId)
            data[`${RI.nav.product}@odata.bind`] = bindTo(Tables.Product.entitySet, draft.productId);
        if (item.requiredAuthorityLevelId)
            data[`${RI.nav.requiredAuthorityLevel}@odata.bind`] = bindTo(
                Tables.AuthorityLevel.entitySet,
                item.requiredAuthorityLevelId
            );
        if (item.underwriterAuthorityId)
            data[`${RI.nav.underwriterAuthority}@odata.bind`] = bindTo(
                Tables.UnderwriterAuthority.entitySet,
                item.underwriterAuthorityId
            );

        await this.dv.create(Tables.ReferralItem.logicalName, data);
    }

    private async readReferralNumber(id: string): Promise<string | undefined> {
        try {
            const row = await this.dv.retrieve(
                Tables.ReferralRequest.logicalName,
                id,
                `?$select=${RR.name}`
            );
            return (row as Record<string, unknown>)[RR.name] as string | undefined;
        } catch {
            return undefined; // Cosmetic only — never fail a successful save over this.
        }
    }
}
