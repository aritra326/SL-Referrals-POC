using System;
using System.Linq;
using Referral.Domain;
using Xunit;

namespace Referral.Domain.Tests
{
    /// <summary>Rules confirmed as POC decisions: action roles, rank versus Can Approve, and decision immutability.</summary>
    public class ActionRoleRulesTests
    {
        [Theory]
        [InlineData(ItemAction.Authorise)]
        [InlineData(ItemAction.AuthoriseWithRecommendations)]
        [InlineData(ItemAction.AuthoriseWithConditions)]
        [InlineData(ItemAction.Reject)]
        [InlineData(ItemAction.RequestInformation)]
        [InlineData(ItemAction.Onward)]
        [InlineData(ItemAction.StartReview)]
        public void ApproverActions_NeedTheApproverTeam(ItemAction action)
        {
            Assert.Equal(ActionRole.Approver, ActionRoleRules.RoleFor(action));
        }

        [Theory]
        [InlineData(ItemAction.Resubmit)]
        [InlineData(ItemAction.CreateRevision)]
        public void RequestorItemActions_NeedTheRequestorTeam(ItemAction action)
        {
            Assert.Equal(ActionRole.Requestor, ActionRoleRules.RoleFor(action));
        }

        [Fact]
        public void EveryReferralAction_IsARequestorAction()
        {
            foreach (ParentAction action in Enum.GetValues(typeof(ParentAction)))
            {
                Assert.Equal(ActionRole.Requestor, ActionRoleRules.RoleFor(action));
            }
        }

        [Fact]
        public void TheTwoTeamsHaveTheAgreedNames()
        {
            Assert.Equal("SL Referral Requestors", ActionRoleRules.TeamName(ActionRole.Requestor));
            Assert.Equal("SL Referral Approvers", ActionRoleRules.TeamName(ActionRole.Approver));
        }
    }

    public class RankAndCanApproveTests
    {
        private static AuthorityFacts Facts(int rank, bool canApprove)
        {
            var product = Guid.NewGuid();
            return new AuthorityFacts
            {
                AssignmentId = Guid.NewGuid(),
                ProductId = product,
                UnderwriterId = Guid.NewGuid(),
                IsActive = true,
                StatusIsCurrent = true,
                EffectiveFrom = new DateTime(2026, 1, 1),
                LevelIsActive = true,
                LevelCanApproveReferrals = canApprove,
                LevelRank = rank
            };
        }

        [Fact]
        public void TheHighestRank_IsNotEligible_WhenTheLevelCannotApproveReferrals()
        {
            AuthorityFacts levelC = Facts(8, false);

            EligibilityResult result = AuthorityEligibilityRules.Check(levelC, levelC.ProductId, 4, new DateTime(2026, 10, 1), RankDirection.HigherNumberGreater);

            Assert.False(result.IsEligible);
            Assert.Equal(LifecycleErrorCodes.AuthorityRank, result.Code);
        }

        [Fact]
        public void RankEight_OutranksSevenAndSix_WhenHigherNumbersAreGreater()
        {
            Assert.True(RankRules.IsStrictlyHigher(8, 7, RankDirection.HigherNumberGreater));
            Assert.True(RankRules.IsStrictlyHigher(7, 6, RankDirection.HigherNumberGreater));
            Assert.False(RankRules.IsStrictlyHigher(6, 7, RankDirection.HigherNumberGreater));
        }

        [Fact]
        public void ARankAboveTheRequirement_WithCanApproveOn_IsEligible()
        {
            AuthorityFacts level7 = Facts(7, true);

            Assert.True(AuthorityEligibilityRules.Check(level7, level7.ProductId, 4, new DateTime(2026, 10, 1), RankDirection.HigherNumberGreater).IsEligible);
        }
    }

    public class DecisionImmutabilityTests
    {
        private static readonly string[] Protected = { "slcrm_decisioncomments", "slcrm_rejectedreason", "slcrm_authorityranksnapshot" };

        [Fact]
        public void ChangingAnEvidenceColumn_IsRefused()
        {
            var error = Assert.Throws<LifecycleException>(
                () => DecisionImmutability.Require(false, new[] { "slcrm_rejectedreason" }, Protected, false));

            Assert.Equal(LifecycleErrorCodes.DecisionImmutable, error.Code);
            Assert.Contains("slcrm_rejectedreason", error.UserMessage);
        }

        [Fact]
        public void ColumnNames_AreComparedIgnoringCase()
        {
            Assert.Throws<LifecycleException>(() => DecisionImmutability.Require(false, new[] { "SLCRM_RejectedReason" }, Protected, false));
        }

        [Fact]
        public void ChangingOnlyUnprotectedColumns_IsAllowed()
        {
            DecisionImmutability.Require(false, new[] { "ownerid", "statecode" }, Protected, false);
        }

        [Fact]
        public void Deleting_IsAlwaysRefused()
        {
            var error = Assert.Throws<LifecycleException>(() => DecisionImmutability.Require(true, new string[0], Protected, false));

            Assert.Equal(LifecycleErrorCodes.DecisionImmutable, error.Code);
        }

        [Fact]
        public void TheExplicitMaintenanceSetting_AllowsBothUpdatesAndDeletes()
        {
            DecisionImmutability.Require(false, new[] { "slcrm_rejectedreason" }, Protected, true);
            DecisionImmutability.Require(true, new string[0], Protected, true);
        }

        [Fact]
        public void AnUpdateThatChangesNothing_IsAllowed()
        {
            DecisionImmutability.Require(false, Enumerable.Empty<string>(), Protected, false);
        }
    }
}
