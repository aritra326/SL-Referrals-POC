using System.Collections.Generic;
using System.Linq;

namespace Referral.Domain
{
    /// <summary>Simple questions about a parent status.</summary>
    public static class ParentStatusRules
    {
        /// <summary>The referral is still open (Dataverse "Active" state).</summary>
        public static bool IsActive(ParentStatus status)
        {
            switch (status)
            {
                case ParentStatus.Draft:
                case ParentStatus.SentForApproval:
                case ParentStatus.MoreInformationRequired:
                case ParentStatus.OnwardForApproval:
                case ParentStatus.PartiallyAuthorisedActionRequired:
                case ParentStatus.RevisionInProgress:
                case ParentStatus.RejectedActionRequired:
                    return true;
                default:
                    return false;
            }
        }
    }

    /// <summary>The result of looking at all current items of a referral.</summary>
    public class ParentOutcome
    {
        public ParentStatus Status { get; set; }
        public int TotalCount { get; set; }
        public int OpenCount { get; set; }
        public int AuthorisedCount { get; set; }
        public int RejectedCount { get; set; }
        public int CancelledCount { get; set; }
    }

    /// <summary>
    /// Works out the parent status from the statuses of its current items.
    /// Source: spec sections 11.6 and 11.7. The order of the checks below is the order of precedence:
    /// an information request must not be hidden by a rejected sibling, and routed work keeps the parent open.
    /// </summary>
    public static class ParentAggregator
    {
        public static ParentOutcome Calculate(
            IReadOnlyCollection<ItemStatus> currentItems,
            bool hasEverBeenSubmitted,
            bool explicitlyCancelled)
        {
            ParentOutcome outcome = CountItems(currentItems);

            if (explicitlyCancelled)
            {
                outcome.Status = ParentStatus.Cancelled;
                return outcome;
            }

            outcome.Status = ChooseStatus(currentItems, hasEverBeenSubmitted);
            return outcome;
        }

        private static ParentOutcome CountItems(IReadOnlyCollection<ItemStatus> items)
        {
            return new ParentOutcome
            {
                TotalCount = items.Count,
                OpenCount = items.Count(ItemStatusRules.IsOpen),
                AuthorisedCount = items.Count(ItemStatusRules.IsAuthorisedFamily),
                RejectedCount = items.Count(s => s == ItemStatus.Rejected),
                CancelledCount = items.Count(s => s == ItemStatus.Cancelled)
            };
        }

        private static ParentStatus ChooseStatus(IReadOnlyCollection<ItemStatus> items, bool hasEverBeenSubmitted)
        {
            if (items.Count == 0 || !hasEverBeenSubmitted || items.All(s => s == ItemStatus.Draft))
            {
                return ParentStatus.Draft;
            }

            if (items.Any(s => s == ItemStatus.MoreInformationNeeded))
            {
                return ParentStatus.MoreInformationRequired;
            }

            if (items.Any(s => s == ItemStatus.RevisionDraft))
            {
                return ParentStatus.RevisionInProgress;
            }

            List<ItemStatus> routed = items.Where(ItemStatusRules.IsAwaitingApprover).ToList();
            if (routed.Count > 0)
            {
                bool everyRoutedItemIsOnward = routed.All(s => s == ItemStatus.OnwardForApproval);
                return everyRoutedItemIsOnward ? ParentStatus.OnwardForApproval : ParentStatus.SentForApproval;
            }

            return ChooseFinishedStatus(items);
        }

        /// <summary>Every item is finished (authorised, rejected or cancelled).</summary>
        private static ParentStatus ChooseFinishedStatus(IReadOnlyCollection<ItemStatus> items)
        {
            List<ItemStatus> notCancelled = items.Where(s => s != ItemStatus.Cancelled).ToList();

            if (notCancelled.Count == 0)
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.AggregationAllCancelled,
                    "Every item on this referral is cancelled. Cancel the referral to close it.");
            }

            bool anyAuthorised = notCancelled.Any(ItemStatusRules.IsAuthorisedFamily);
            bool anyRejected = notCancelled.Any(s => s == ItemStatus.Rejected);

            if (anyAuthorised && anyRejected)
            {
                return ParentStatus.PartiallyAuthorisedActionRequired;
            }

            if (notCancelled.All(s => s == ItemStatus.Rejected))
            {
                return ParentStatus.RejectedActionRequired;
            }

            if (notCancelled.All(ItemStatusRules.IsAuthorisedFamily))
            {
                if (notCancelled.Any(s => s == ItemStatus.AuthorisedWithConditions))
                {
                    return ParentStatus.AuthorisedWithConditions;
                }

                if (notCancelled.Any(s => s == ItemStatus.AuthorisedWithRecommendations))
                {
                    return ParentStatus.AuthorisedWithRecommendations;
                }

                return ParentStatus.Authorised;
            }

            throw new LifecycleException(
                LifecycleErrorCodes.AggregationUnsupported,
                "The items on this referral are in a combination of statuses the system cannot summarise.");
        }
    }
}
