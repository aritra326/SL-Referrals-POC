using System.Collections.Generic;
using Referral.Domain;

namespace Referral.Dataverse
{
    /// <summary>
    /// The ONE place that says which Dataverse option label means which business status.
    /// Labels were read from the live environment's metadata. Numeric values are never written in code
    /// because they are assigned per environment; <see cref="OptionValueResolver"/> finds them at run time.
    /// Note the environment's wording: items say "Submitted", "More Information Needed" and "Revision Draft",
    /// while referrals say "Sent for Approval", "More Information Required" and "Revision in Progress".
    /// </summary>
    public static class OptionLabels
    {
        public static readonly IDictionary<ItemStatus, string> ItemStatus = new Dictionary<ItemStatus, string>
        {
            { Domain.ItemStatus.Draft, "Draft" },
            { Domain.ItemStatus.Submitted, "Submitted" },
            { Domain.ItemStatus.InReview, "In Review" },
            { Domain.ItemStatus.MoreInformationNeeded, "More Information Needed" },
            { Domain.ItemStatus.Resubmitted, "Resubmitted" },
            { Domain.ItemStatus.OnwardForApproval, "Onward for Approval" },
            { Domain.ItemStatus.RevisionDraft, "Revision Draft" },
            { Domain.ItemStatus.Authorised, "Authorised" },
            { Domain.ItemStatus.AuthorisedWithRecommendations, "Authorised with Recommendations" },
            { Domain.ItemStatus.AuthorisedWithConditions, "Authorised with Conditions" },
            { Domain.ItemStatus.Rejected, "Rejected" },
            { Domain.ItemStatus.Cancelled, "Cancelled / No Longer Required" },
            { Domain.ItemStatus.Superseded, "Superseded" }
        };

        public static readonly IDictionary<ParentStatus, string> ParentStatus = new Dictionary<ParentStatus, string>
        {
            { Domain.ParentStatus.Draft, "Draft" },
            { Domain.ParentStatus.SentForApproval, "Sent for Approval" },
            { Domain.ParentStatus.MoreInformationRequired, "More Information Required" },
            { Domain.ParentStatus.OnwardForApproval, "Onward for Approval" },
            { Domain.ParentStatus.PartiallyAuthorisedActionRequired, "Partially Authorised - Action Required" },
            { Domain.ParentStatus.RevisionInProgress, "Revision in Progress" },
            { Domain.ParentStatus.RejectedActionRequired, "Rejected - UW Action Required" },
            { Domain.ParentStatus.Authorised, "Authorised" },
            { Domain.ParentStatus.AuthorisedWithRecommendations, "Authorised with Recommendations" },
            { Domain.ParentStatus.AuthorisedWithConditions, "Authorised with Conditions" },
            { Domain.ParentStatus.PartiallyAuthorisedCompleted, "Partially Authorised - Completed" },
            { Domain.ParentStatus.Rejected, "Rejected" },
            { Domain.ParentStatus.Cancelled, "Cancelled / No Longer Required" }
        };

        public static readonly IDictionary<DecisionType, string> DecisionType = new Dictionary<DecisionType, string>
        {
            { Domain.DecisionType.Authorised, "Authorised" },
            { Domain.DecisionType.AuthorisedWithRecommendation, "Authorised With Recommendation" },
            { Domain.DecisionType.MoreInformationNeeded, "More Information Needed" },
            { Domain.DecisionType.OnwardForApproval, "Onward for Approval" },
            { Domain.DecisionType.Rejected, "Rejected" }
        };

        /// <summary>The Underwriting Authority status reason that means "in force".</summary>
        public const string AuthorityStatusCurrent = "Current";
    }
}
