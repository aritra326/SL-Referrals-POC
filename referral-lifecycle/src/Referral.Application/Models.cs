using System;
using Referral.Domain;

namespace Referral.Application
{
    /// <summary>The parts of a Referral Item the lifecycle rules need.</summary>
    public class ItemRecord
    {
        public Guid Id { get; set; }
        public Guid ParentId { get; set; }
        public ItemStatus Status { get; set; }

        /// <summary>Dataverse row version when the item was read. Used to detect that someone else changed it meanwhile.</summary>
        public string RowVersion { get; set; }

        public bool IsCurrentRevision { get; set; }
        public int RevisionNumber { get; set; }

        /// <summary>A short name for messages, for example the item number.</summary>
        public string Label { get; set; }

        public Guid? AssignedApproverId { get; set; }

        /// <summary>The Underwriting Authority assignment responsible for this item (the lookup the Referral Builder fills in).</summary>
        public Guid? AuthorityAssignmentId { get; set; }

        public Guid? RequiredAuthorityLevelId { get; set; }
        public Guid? ReferralReasonId { get; set; }
        public Guid? CoverSectionId { get; set; }
        public string ItemSummary { get; set; }
        public string ReferralDetails { get; set; }
        public string UnderwriterRationale { get; set; }
        public string InformationResponse { get; set; }
        public string ChangeSummary { get; set; }
    }

    /// <summary>The parts of a Referral Request the lifecycle rules need.</summary>
    public class ParentRecord
    {
        public Guid Id { get; set; }
        public ParentStatus Status { get; set; }
        public bool HasEverBeenSubmitted { get; set; }
        public bool ExplicitlyCancelled { get; set; }
        public Guid? PrimaryUnderwriterId { get; set; }
        public Guid? ProductId { get; set; }
    }

    /// <summary>Changes to write to an item. Only the properties that are set are written.</summary>
    public class ItemUpdate
    {
        public Guid Id { get; set; }

        /// <summary>When set, the write fails with a conflict error if the item changed since it was read.</summary>
        public string ExpectedRowVersion { get; set; }

        public ItemStatus? Status { get; set; }
        public DateTime? ReviewStartedOn { get; set; }
        public DateTime? SubmittedOn { get; set; }
        public Guid? SubmittedBy { get; set; }
        public DateTime? RespondedOn { get; set; }
        public Guid? AuthorityAssignmentId { get; set; }
        public Guid? AssignedApproverId { get; set; }
        public string AssignedApproverSnapshot { get; set; }
    }

    /// <summary>Changes to write to a parent. Only the properties that are set are written.</summary>
    public class ParentUpdate
    {
        public Guid Id { get; set; }
        public ParentStatus? Status { get; set; }

        /// <summary>When set, the five current-item counts are written too.</summary>
        public ParentOutcome Counts { get; set; }

        public bool? HasEverBeenSubmitted { get; set; }
        public DateTime? SubmittedOn { get; set; }
        public Guid? SubmittedBy { get; set; }
        public DateTime? LastSubmittedOn { get; set; }
        public bool? ExplicitlyCancelled { get; set; }
        public string CancellationReason { get; set; }
        public DateTime? CompletedOn { get; set; }
        public Guid? CompletedBy { get; set; }
        public string OutcomeSummary { get; set; }
        public DateTime? LastAggregatedOn { get; set; }
    }

    /// <summary>One new, permanent Referral Decision row.</summary>
    public class NewDecision
    {
        public Guid ItemId { get; set; }
        public Guid ParentId { get; set; }
        public DecisionType DecisionType { get; set; }
        public Guid DecidedBy { get; set; }
        public DateTime DecidedOn { get; set; }
        public int Sequence { get; set; }
        public int ItemRevisionNumber { get; set; }
        public ItemStatus PreviousItemStatus { get; set; }
        public ItemStatus NewItemStatus { get; set; }
        public string Comments { get; set; }
        public string Recommendations { get; set; }
        public string InformationRequested { get; set; }
        public string RejectionReason { get; set; }
        public Guid? OnwardAuthorityId { get; set; }
        public string OnwardApproverSnapshot { get; set; }
        /// <summary>
        /// Evidence of the authority behind the decision, captured at decision time so that later changes to the live
        /// Authority Level cannot rewrite why the decision was valid. The deciding user is <see cref="DecidedBy"/>.
        /// </summary>
        public Guid? AuthorityAssignmentUsedId { get; set; }
        public Guid? AuthorityLevelUsedId { get; set; }
        public string AuthorityLevelSnapshot { get; set; }
        public int? AuthorityRankSnapshot { get; set; }
        public bool? CanApproveReferralsSnapshot { get; set; }
        public string CorrelationId { get; set; }
    }

    /// <summary>What the caller asked for on a Referral Item.</summary>
    public class ItemActionRequest
    {
        public Guid ItemId { get; set; }
        public string ActionName { get; set; }
        public string Comment { get; set; }
        public Guid? NewAuthorityId { get; set; }

        /// <summary>The signed-in user who started the request.</summary>
        public Guid CallerId { get; set; }

        public string CorrelationId { get; set; }

        /// <summary>
        /// Reserved for explicit idempotency. The deployed Custom APIs do not carry it yet, so it is always null today;
        /// duplicates are stopped by the status rules instead. Adding it later should not need a use-case rewrite.
        /// </summary>
        public string ClientRequestId { get; set; }
    }

    /// <summary>What the caller asked for on a Referral Request.</summary>
    public class ParentActionRequest
    {
        public Guid ParentId { get; set; }
        public string ActionName { get; set; }
        public string Comment { get; set; }
        public Guid CallerId { get; set; }
        public string CorrelationId { get; set; }
    }
}
