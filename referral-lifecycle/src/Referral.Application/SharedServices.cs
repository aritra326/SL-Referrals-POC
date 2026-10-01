using System;
using System.Linq;
using Referral.Domain;

namespace Referral.Application
{
    /// <summary>Looks up an authority assignment and applies the domain eligibility rule to it.</summary>
    public class AuthorityChecker
    {
        private readonly IReferralRepository _repository;
        private readonly IClock _clock;

        public AuthorityChecker(IReferralRepository repository, IClock clock)
        {
            _repository = repository;
            _clock = clock;
        }

        /// <summary>
        /// Throws if the assignment may not decide an item of this referral; otherwise returns its facts
        /// (the caller needs them for the decision snapshots).
        /// </summary>
        public AuthorityFacts RequireEligible(
            Guid? assignmentId,
            ParentRecord parent,
            Guid? requiredLevelId,
            RankDirection direction)
        {
            if (!assignmentId.HasValue)
            {
                throw new LifecycleException(LifecycleErrorCodes.AuthorityMissingInput, "No authority assignment is set on this item.");
            }

            int requiredRank = GetRequiredRank(requiredLevelId);
            AuthorityFacts facts = _repository.GetAuthority(assignmentId.Value);

            EligibilityResult result = AuthorityEligibilityRules.Check(facts, parent.ProductId, requiredRank, _clock.UtcNow, direction);
            result.ThrowIfNotEligible();
            return facts;
        }

        /// <summary>The rank of the level the item requires. Missing level or rank is a data problem the user must fix.</summary>
        public int GetRequiredRank(Guid? requiredLevelId)
        {
            int? rank = requiredLevelId.HasValue ? _repository.GetAuthorityLevelRank(requiredLevelId.Value) : null;
            if (!rank.HasValue)
            {
                throw new LifecycleException(LifecycleErrorCodes.ValidationField, "The item has no required authority level (or the level has no rank).");
            }

            return rank.Value;
        }
    }

    /// <summary>Recalculates a referral's status and item counts from its current items (spec 11.6).</summary>
    public class ParentRecalculator
    {
        private readonly IReferralRepository _repository;
        private readonly IClock _clock;
        private readonly ITrace _trace;

        public ParentRecalculator(IReferralRepository repository, IClock clock, ITrace trace)
        {
            _repository = repository;
            _clock = clock;
            _trace = trace;
        }

        public void Recalculate(Guid parentId)
        {
            ParentRecord parent = _repository.GetParent(parentId);
            var statuses = _repository.GetCurrentItems(parentId).Select(item => item.Status).ToList();

            ParentOutcome outcome = ParentAggregator.Calculate(statuses, parent.HasEverBeenSubmitted, parent.ExplicitlyCancelled);
            _trace.Write("Parent " + parentId + " recalculated: " + parent.Status + " -> " + outcome.Status);

            _repository.UpdateParent(new ParentUpdate
            {
                Id = parentId,
                Status = outcome.Status,
                Counts = outcome,
                LastAggregatedOn = _clock.UtcNow
            });
        }
    }

    /// <summary>Who is allowed to run an action. The server checks this; the UI is only a convenience.</summary>
    public static class CallerRules
    {
        public static void RequireAssignedApprover(ItemRecord item, Guid callerId)
        {
            if (!item.AssignedApproverId.HasValue || item.AssignedApproverId.Value != callerId)
            {
                throw new LifecycleException(LifecycleErrorCodes.NotPermitted, "Only the assigned approver can do this on the item.");
            }
        }

        public static void RequirePrimaryUnderwriter(ParentRecord parent, Guid callerId)
        {
            if (!parent.PrimaryUnderwriterId.HasValue || parent.PrimaryUnderwriterId.Value != callerId)
            {
                throw new LifecycleException(LifecycleErrorCodes.NotPermitted, "Only the primary underwriter on the referral can do this.");
            }
        }

        public static void RequireCurrentRevision(ItemRecord item)
        {
            if (!item.IsCurrentRevision)
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.StatusConflict,
                    "This item has been replaced by a newer revision. Open the latest revision instead.");
            }
        }

        public static void RequireReferralOpen(ParentRecord parent)
        {
            if (!ParentStatusRules.IsActive(parent.Status))
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.StatusConflict,
                    "This referral is closed ('" + parent.Status + "'), so its items can no longer be changed.");
            }
        }
    }
}
