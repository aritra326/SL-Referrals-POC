using System;
using Referral.Domain;
using Xunit;

namespace Referral.Domain.Tests
{
    /// <summary>The live eligibility predicate (spec 8.4), limited to what the current schema can answer.</summary>
    public class AuthorityEligibilityRulesTests
    {
        private static readonly Guid Product = Guid.NewGuid();
        private static readonly DateTime Today = new DateTime(2026, 10, 1, 9, 30, 0, DateTimeKind.Utc);

        /// <summary>A fully eligible assignment: right product, current, in date, level 4 that can approve.</summary>
        private static AuthorityFacts ValidAuthority()
        {
            return new AuthorityFacts
            {
                AssignmentId = Guid.NewGuid(),
                ProductId = Product,
                UnderwriterId = Guid.NewGuid(),
                IsActive = true,
                StatusIsCurrent = true,
                EffectiveFrom = new DateTime(2026, 9, 1),
                EffectiveTo = new DateTime(2027, 8, 31),
                LevelIsActive = true,
                LevelCanApproveReferrals = true,
                LevelRank = 4,
                LevelName = "Level 4",
                UnderwriterIsDisabled = false
            };
        }

        private static EligibilityResult Check(AuthorityFacts authority, int requiredRank = 4, RankDirection direction = RankDirection.HigherNumberGreater)
        {
            return AuthorityEligibilityRules.Check(authority, Product, requiredRank, Today, direction);
        }

        [Fact]
        public void ValidAssignment_IsEligible()
        {
            Assert.True(Check(ValidAuthority()).IsEligible);
        }

        [Fact]
        public void MissingAssignment_IsNotEligible()
        {
            Assert.Equal(LifecycleErrorCodes.AuthorityMissingInput, Check(null).Code);
        }

        [Fact]
        public void AssignmentForAnotherProduct_IsNotEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.ProductId = Guid.NewGuid();

            Assert.Equal(LifecycleErrorCodes.AuthorityProduct, Check(authority).Code);
        }

        [Fact]
        public void ReferralWithoutAProduct_IsNotEligible_RatherThanMatchingAnything()
        {
            EligibilityResult result = AuthorityEligibilityRules.Check(ValidAuthority(), null, 4, Today, RankDirection.HigherNumberGreater);
            Assert.Equal(LifecycleErrorCodes.AuthorityProduct, result.Code);
        }

        [Fact]
        public void SuspendedAssignment_IsNotEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.IsActive = false;

            Assert.Equal(LifecycleErrorCodes.AuthorityStatus, Check(authority).Code);
        }

        [Fact]
        public void AssignmentThatIsNotInStatusCurrent_IsNotEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.StatusIsCurrent = false;

            Assert.Equal(LifecycleErrorCodes.AuthorityStatus, Check(authority).Code);
        }

        [Fact]
        public void AssignmentThatStartsTomorrow_IsNotEligibleYet()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.EffectiveFrom = Today.Date.AddDays(1);

            Assert.Equal(LifecycleErrorCodes.AuthorityStatus, Check(authority).Code);
        }

        [Fact]
        public void AssignmentThatStartsToday_IsEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.EffectiveFrom = Today.Date;

            Assert.True(Check(authority).IsEligible);
        }

        [Fact]
        public void AssignmentThatEndedYesterday_IsExpired()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.EffectiveTo = Today.Date.AddDays(-1);

            Assert.Equal(LifecycleErrorCodes.AuthorityExpired, Check(authority).Code);
        }

        [Fact]
        public void AssignmentThatEndsToday_IsStillEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.EffectiveTo = Today.Date;

            Assert.True(Check(authority).IsEligible);
        }

        [Fact]
        public void AssignmentWithNoEndDate_IsEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.EffectiveTo = null;

            Assert.True(Check(authority).IsEligible);
        }

        [Fact]
        public void AssignmentWithNoStartDate_IsNotEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.EffectiveFrom = null;

            Assert.Equal(LifecycleErrorCodes.AuthorityStatus, Check(authority).Code);
        }

        [Fact]
        public void LevelThatCannotApproveReferrals_IsNotEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.LevelCanApproveReferrals = false;

            Assert.Equal(LifecycleErrorCodes.AuthorityRank, Check(authority).Code);
        }

        [Fact]
        public void InactiveLevel_IsNotEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.LevelIsActive = false;

            Assert.Equal(LifecycleErrorCodes.AuthorityRank, Check(authority).Code);
        }

        [Fact]
        public void LevelWithoutARank_IsNotEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.LevelRank = null;

            Assert.Equal(LifecycleErrorCodes.AuthorityRank, Check(authority).Code);
        }

        [Fact]
        public void DisabledUnderwriter_IsNotEligible()
        {
            AuthorityFacts authority = ValidAuthority();
            authority.UnderwriterIsDisabled = true;

            Assert.Equal(LifecycleErrorCodes.AuthorityUser, Check(authority).Code);
        }

        [Theory]
        [InlineData(4, 4, true)]
        [InlineData(5, 4, true)]
        [InlineData(3, 4, false)]
        public void WhenHigherNumbersAreGreater_TheLevelMustBeAtLeastTheRequiredRank(int assignmentRank, int requiredRank, bool expected)
        {
            AuthorityFacts authority = ValidAuthority();
            authority.LevelRank = assignmentRank;

            Assert.Equal(expected, Check(authority, requiredRank, RankDirection.HigherNumberGreater).IsEligible);
        }

        [Theory]
        [InlineData(4, 4, true)]
        [InlineData(3, 4, true)]
        [InlineData(5, 4, false)]
        public void WhenLowerNumbersAreGreater_TheLevelMustBeAtMostTheRequiredRank(int assignmentRank, int requiredRank, bool expected)
        {
            AuthorityFacts authority = ValidAuthority();
            authority.LevelRank = assignmentRank;

            Assert.Equal(expected, Check(authority, requiredRank, RankDirection.LowerNumberGreater).IsEligible);
        }

        [Theory]
        [InlineData(5, 4, RankDirection.HigherNumberGreater, true)]
        [InlineData(4, 4, RankDirection.HigherNumberGreater, false)]
        [InlineData(3, 4, RankDirection.HigherNumberGreater, false)]
        [InlineData(3, 4, RankDirection.LowerNumberGreater, true)]
        [InlineData(4, 4, RankDirection.LowerNumberGreater, false)]
        public void OnwardDestination_MustBeStrictlyHigher(int destination, int current, RankDirection direction, bool expected)
        {
            Assert.Equal(expected, RankRules.IsStrictlyHigher(destination, current, direction));
        }

        [Theory]
        [InlineData("HigherNumberGreater", RankDirection.HigherNumberGreater)]
        [InlineData("lowernumbergreater", RankDirection.LowerNumberGreater)]
        public void RankDirectionSetting_IsReadIgnoringCase(string text, RankDirection expected)
        {
            Assert.Equal(expected, RankRules.Parse(text));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("Sideways")]
        public void MissingOrInvalidRankDirection_IsAConfigurationError(string text)
        {
            Assert.Equal(LifecycleErrorCodes.RankConfiguration, Assert.Throws<LifecycleException>(() => RankRules.Parse(text)).Code);
        }

        [Fact]
        public void Settings_WithoutARankDirection_RefuseToCompareRanks()
        {
            var settings = new LifecycleSettings();

            Assert.Equal(LifecycleErrorCodes.RankConfiguration, Assert.Throws<LifecycleException>(() => settings.RequireRankDirection()).Code);
        }
    }
}
