using System;
using System.Collections.Generic;
using System.Linq;
using Referral.Domain;

namespace Referral.Application
{
    /// <summary>One authority assignment an approver may send an item onward to.</summary>
    public class EligibleAuthority
    {
        public Guid AssignmentId { get; set; }
        public string AssignmentName { get; set; }
        public string ApproverName { get; set; }
        public string LevelName { get; set; }
        public int Rank { get; set; }
        public string LicenceScheme { get; set; }
        public string ProductName { get; set; }
    }

    /// <summary>
    /// Lists the authority assignments a referral item can be sent onward to (the slcrm_GetEligibleAuthorities Custom API).
    /// It applies exactly the rules the Onward action enforces, so the picker can never offer a choice the server would refuse:
    /// eligible for the referral's product and the item's required level, strictly higher than the current assignment,
    /// and not the caller or the assignment the item already has. Team membership plays no part here.
    /// Read-only: nothing is written.
    /// </summary>
    public class EligibleAuthorityService
    {
        private readonly IReferralRepository _repository;
        private readonly ILifecycleSettingsProvider _settings;
        private readonly IClock _clock;
        private readonly ITrace _trace;
        private readonly AuthorityChecker _authority;
        private readonly ActionRoleChecker _roles;

        public EligibleAuthorityService(
            IReferralRepository repository,
            ILifecycleSettingsProvider settings,
            IClock clock,
            ITrace trace)
        {
            _repository = repository;
            _settings = settings;
            _clock = clock;
            _trace = trace;
            _authority = new AuthorityChecker(repository, clock);
            _roles = new ActionRoleChecker(repository, settings, trace);
        }

        public IList<EligibleAuthority> Find(Guid itemId, Guid callerId)
        {
            ItemRecord item = _repository.GetItem(itemId);
            ParentRecord parent = _repository.GetParent(item.ParentId);

            CallerRules.RequireCurrentRevision(item);
            CallerRules.RequireReferralOpen(parent);
            ItemTransitionRules.GetTargetStatus(ItemAction.Onward, item.Status);
            _roles.Require(ActionRoleRules.RoleFor(ItemAction.Onward), callerId);
            CallerRules.RequireAssignedApprover(item, callerId);

            RankDirection direction = _settings.Load().RequireRankDirection();
            AuthorityFacts current = _authority.RequireEligible(item.AuthorityAssignmentId, parent, item.RequiredAuthorityLevelId, direction);
            int requiredRank = _authority.GetRequiredRank(item.RequiredAuthorityLevelId);

            if (!parent.ProductId.HasValue)
            {
                return new List<EligibleAuthority>();
            }

            List<EligibleAuthority> found = _repository
                .GetAuthoritiesForProduct(parent.ProductId.Value)
                .Where(candidate => IsValidDestination(candidate, current, parent, requiredRank, callerId, direction))
                .Select(candidate => new EligibleAuthority
                {
                    AssignmentId = candidate.AssignmentId,
                    AssignmentName = candidate.AssignmentName,
                    ApproverName = candidate.UnderwriterName,
                    LevelName = candidate.LevelName,
                    Rank = candidate.LevelRank.Value,
                    LicenceScheme = candidate.LicenceScheme,
                    ProductName = candidate.ProductName
                })
                .OrderBy(e => e.Rank)
                .ThenBy(e => e.AssignmentName)
                .ToList();

            _trace.Write("Eligible onward authorities for item " + itemId + ": " + found.Count);
            return found;
        }

        private bool IsValidDestination(
            AuthorityFacts candidate, AuthorityFacts current, ParentRecord parent, int requiredRank, Guid callerId, RankDirection direction)
        {
            if (candidate.AssignmentId == current.AssignmentId || candidate.UnderwriterId == callerId)
            {
                return false;
            }

            EligibilityResult eligibility = AuthorityEligibilityRules.Check(candidate, parent.ProductId, requiredRank, _clock.UtcNow, direction);
            return eligibility.IsEligible && RankRules.IsStrictlyHigher(candidate.LevelRank.Value, current.LevelRank.Value, direction);
        }
    }
}
