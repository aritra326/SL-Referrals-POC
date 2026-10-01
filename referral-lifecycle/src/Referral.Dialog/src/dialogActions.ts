/**
 * Which actions the decision dialog handles and what it asks the user for.
 * The server enforces the same rules (Referral.Domain ActionInputRules); this table only drives the screen.
 */

export type TargetTable = "slcrm_referralitem" | "slcrm_referralrequest";

export interface DialogAction {
    /** The ActionName the Custom API expects. */
    name: string;
    target: TargetTable;
    title: string;
    commentLabel: string;
    commentHint: string;
    commentRequired: boolean;
    confirmLabel: string;
    /** One sentence telling the user what will happen. */
    consequence: string;
}

const ACTIONS: DialogAction[] = [
    {
        name: "Authorise",
        target: "slcrm_referralitem",
        title: "Authorise referral item",
        commentLabel: "Comment",
        commentHint: "Optional. Anything the underwriter should know about this authorisation.",
        commentRequired: false,
        confirmLabel: "Authorise",
        consequence: "The item is authorised and a permanent decision record is created.",
    },
    {
        name: "Reject",
        target: "slcrm_referralitem",
        title: "Reject referral item",
        commentLabel: "Rejection reason",
        commentHint: "Required. Explain why the item is rejected.",
        commentRequired: true,
        confirmLabel: "Reject",
        consequence: "The item is rejected and a permanent decision record is created. The underwriter can then revise it.",
    },
    {
        name: "AuthoriseWithRecommendations",
        target: "slcrm_referralitem",
        title: "Authorise with recommendations",
        commentLabel: "Recommendations",
        commentHint: "Required. The advice that goes with this authorisation.",
        commentRequired: true,
        confirmLabel: "Authorise",
        consequence: "The item is authorised with your recommendations and a decision record is created.",
    },
    {
        name: "RequestInformation",
        target: "slcrm_referralitem",
        title: "Request information",
        commentLabel: "Information needed",
        commentHint: "Required. Say what the underwriter needs to provide.",
        commentRequired: true,
        confirmLabel: "Request information",
        consequence: "The item goes back to the underwriter and a decision record is created.",
    },
    {
        name: "CompleteRejected",
        target: "slcrm_referralrequest",
        title: "Close referral as rejected",
        commentLabel: "Acknowledgement",
        commentHint: "Required. Confirm that you accept the rejection.",
        commentRequired: true,
        confirmLabel: "Close as rejected",
        consequence: "The referral is closed as Rejected and can no longer be changed.",
    },
    {
        name: "CompletePartial",
        target: "slcrm_referralrequest",
        title: "Complete partial outcome",
        commentLabel: "Outcome summary",
        commentHint: "Optional. Summarise the reduced scope you are accepting.",
        commentRequired: false,
        confirmLabel: "Complete",
        consequence: "The referral is closed as Partially Authorised and can no longer be changed.",
    },
    {
        name: "Cancel",
        target: "slcrm_referralrequest",
        title: "Cancel referral",
        commentLabel: "Cancellation reason",
        commentHint: "Required. Why is the referral no longer needed?",
        commentRequired: true,
        confirmLabel: "Cancel referral",
        consequence: "Open items are cancelled and the referral is closed. Items that already have an outcome are kept.",
    },
];

export function findAction(target: string, name: string): DialogAction | undefined {
    return ACTIONS.find((a) => a.target === target && a.name.toLowerCase() === (name || "").toLowerCase());
}

/** Returns the message to show when the comment is not acceptable, or null when it is fine. */
export function validateComment(action: DialogAction, comment: string): string | null {
    if (action.commentRequired && comment.trim().length === 0) {
        return `Enter the ${action.commentLabel.toLowerCase()} before you continue.`;
    }
    return null;
}
