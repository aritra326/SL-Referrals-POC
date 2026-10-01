namespace Referral.Domain
{
    /// <summary>Simple questions about an item status.</summary>
    public static class ItemStatusRules
    {
        /// <summary>Work is still in progress (Dataverse "Active" state).</summary>
        public static bool IsOpen(ItemStatus status)
        {
            switch (status)
            {
                case ItemStatus.Draft:
                case ItemStatus.Submitted:
                case ItemStatus.InReview:
                case ItemStatus.MoreInformationNeeded:
                case ItemStatus.Resubmitted:
                case ItemStatus.OnwardForApproval:
                case ItemStatus.RevisionDraft:
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>The item is waiting for an approver to act on it.</summary>
        public static bool IsAwaitingApprover(ItemStatus status)
        {
            return status == ItemStatus.Submitted
                || status == ItemStatus.InReview
                || status == ItemStatus.Resubmitted
                || status == ItemStatus.OnwardForApproval;
        }

        public static bool IsAuthorisedFamily(ItemStatus status)
        {
            return status == ItemStatus.Authorised
                || status == ItemStatus.AuthorisedWithRecommendations
                || status == ItemStatus.AuthorisedWithConditions;
        }
    }

    /// <summary>
    /// Which item status each action may start from, and where it leads.
    /// Source: spec section 11.4 (item transition matrix).
    /// </summary>
    public static class ItemTransitionRules
    {
        /// <summary>
        /// Returns the status the item moves to. Throws if the action is not allowed from the current status.
        /// For CreateRevision this is the status of the NEW revision row; the rejected row keeps its status.
        /// </summary>
        public static ItemStatus GetTargetStatus(ItemAction action, ItemStatus current)
        {
            switch (action)
            {
                case ItemAction.StartReview:
                    RequireOneOf(action, current, ItemStatus.Submitted, ItemStatus.Resubmitted, ItemStatus.OnwardForApproval);
                    return ItemStatus.InReview;

                case ItemAction.RequestInformation:
                    RequireAwaitingApprover(action, current);
                    return ItemStatus.MoreInformationNeeded;

                case ItemAction.Onward:
                    RequireAwaitingApprover(action, current);
                    return ItemStatus.OnwardForApproval;

                case ItemAction.Authorise:
                    RequireAwaitingApprover(action, current);
                    return ItemStatus.Authorised;

                case ItemAction.AuthoriseWithRecommendations:
                    RequireAwaitingApprover(action, current);
                    return ItemStatus.AuthorisedWithRecommendations;

                case ItemAction.AuthoriseWithConditions:
                    RequireAwaitingApprover(action, current);
                    return ItemStatus.AuthorisedWithConditions;

                case ItemAction.Reject:
                    RequireAwaitingApprover(action, current);
                    return ItemStatus.Rejected;

                case ItemAction.Resubmit:
                    RequireOneOf(action, current, ItemStatus.MoreInformationNeeded, ItemStatus.RevisionDraft);
                    return ItemStatus.Resubmitted;

                case ItemAction.CreateRevision:
                    RequireOneOf(action, current, ItemStatus.Rejected);
                    return ItemStatus.RevisionDraft;

                default:
                    // Item-level Cancel is not a confirmed command (cancellation is a parent operation). See docs/open-questions.md.
                    throw new LifecycleException(
                        LifecycleErrorCodes.ActionUnsupported,
                        "This action is not available on a single referral item. Cancel the whole referral instead.");
            }
        }

        private static void RequireAwaitingApprover(ItemAction action, ItemStatus current)
        {
            if (!ItemStatusRules.IsAwaitingApprover(current))
            {
                throw StatusConflict(action, current);
            }
        }

        private static void RequireOneOf(ItemAction action, ItemStatus current, params ItemStatus[] allowed)
        {
            foreach (ItemStatus status in allowed)
            {
                if (status == current)
                {
                    return;
                }
            }

            throw StatusConflict(action, current);
        }

        private static LifecycleException StatusConflict(ItemAction action, ItemStatus current)
        {
            return new LifecycleException(
                LifecycleErrorCodes.StatusConflict,
                "The action '" + action + "' is not allowed while the item is '" + current + "'. Refresh the record and try again.");
        }
    }
}
