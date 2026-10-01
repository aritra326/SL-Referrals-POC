using System;

namespace Referral.Domain
{
    /// <summary>
    /// Which text each action needs from the caller.
    /// The decision dialog shows the same rules, but this class is the one that is enforced.
    /// </summary>
    public static class ActionInputRules
    {
        /// <summary>The Recommendations column holds up to 4000 characters. Longer text is refused, never shortened.</summary>
        public const int MaxRecommendationsLength = 4000;

        /// <summary>Is the Comment mandatory for this item action? Authorise is deliberately optional (spec 11.4).</summary>
        public static bool IsCommentRequired(ItemAction action)
        {
            switch (action)
            {
                case ItemAction.AuthoriseWithRecommendations:
                case ItemAction.AuthoriseWithConditions:
                case ItemAction.Reject:
                case ItemAction.RequestInformation:
                case ItemAction.Onward:
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>Throws SLR-DECISION-FIELD when a required comment is blank, or the onward authority is missing.</summary>
        public static void ValidateItemInput(ItemAction action, string comment, Guid? newAuthorityId)
        {
            if (IsCommentRequired(action) && string.IsNullOrWhiteSpace(comment))
            {
                throw new LifecycleException(LifecycleErrorCodes.DecisionField, DescribeMissingComment(action));
            }

            if (action == ItemAction.AuthoriseWithRecommendations && comment != null && comment.Length > MaxRecommendationsLength)
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.DecisionField,
                    "Recommendations can be at most " + MaxRecommendationsLength + " characters (you entered " + comment.Length + ").");
            }

            if (action == ItemAction.Onward && !newAuthorityId.HasValue)
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.AuthorityMissingInput,
                    "Choose the authority the item should be sent onward to.");
            }
        }

        /// <summary>Cancel needs a reason; accepting a rejection needs an acknowledgement; partial completion needs nothing.</summary>
        public static void ValidateParentInput(ParentAction action, string comment)
        {
            bool blank = string.IsNullOrWhiteSpace(comment);

            if (action == ParentAction.Cancel && blank)
            {
                throw new LifecycleException(LifecycleErrorCodes.CancelReason, "Enter a reason for cancelling the referral.");
            }

            if (action == ParentAction.CompleteRejected && blank)
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.AcknowledgementRequired,
                    "Enter a note acknowledging that the referral is closed as rejected.");
            }
        }

        private static string DescribeMissingComment(ItemAction action)
        {
            switch (action)
            {
                case ItemAction.Reject:
                    return "Enter the reason for rejecting this item.";
                case ItemAction.RequestInformation:
                    return "Describe the information you need from the underwriter.";
                case ItemAction.AuthoriseWithRecommendations:
                    return "Enter the recommendations.";
                case ItemAction.AuthoriseWithConditions:
                    return "Enter the conditions.";
                default:
                    return "Enter a comment for this action.";
            }
        }
    }
}
