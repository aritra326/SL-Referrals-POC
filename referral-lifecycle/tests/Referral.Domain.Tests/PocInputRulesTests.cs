using Referral.Domain;
using Xunit;

namespace Referral.Domain.Tests
{
    public class RecommendationLengthTests
    {
        [Fact]
        public void RecommendationsUpToTheColumnLimit_AreAccepted()
        {
            ActionInputRules.ValidateItemInput(ItemAction.AuthoriseWithRecommendations, new string('r', ActionInputRules.MaxRecommendationsLength), null);
        }

        [Fact]
        public void RecommendationsOverTheLimit_AreRefusedWithAClearMessage_NotShortened()
        {
            var error = Assert.Throws<LifecycleException>(
                () => ActionInputRules.ValidateItemInput(ItemAction.AuthoriseWithRecommendations, new string('r', ActionInputRules.MaxRecommendationsLength + 1), null));

            Assert.Equal(LifecycleErrorCodes.DecisionField, error.Code);
            Assert.Contains("4000", error.UserMessage);
            Assert.Contains("4001", error.UserMessage);
        }

        [Fact]
        public void TheLimitOnlyAppliesToRecommendations()
        {
            ActionInputRules.ValidateItemInput(ItemAction.Reject, new string('x', 10000), null);
            ActionInputRules.ValidateItemInput(ItemAction.Authorise, new string('x', 10000), null);
        }

        [Fact]
        public void ARecommendationOfAFewParagraphs_IsWellInsideTheLimit()
        {
            ActionInputRules.ValidateItemInput(ItemAction.AuthoriseWithRecommendations, new string('x', 1500), null);
        }
    }
}
