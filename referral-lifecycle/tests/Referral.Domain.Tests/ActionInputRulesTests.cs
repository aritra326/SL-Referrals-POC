using System;
using Referral.Domain;
using Xunit;

namespace Referral.Domain.Tests
{
    public class ActionInputRulesTests
    {
        [Fact]
        public void Authorise_DoesNotNeedAComment()
        {
            ActionInputRules.ValidateItemInput(ItemAction.Authorise, null, null);
            ActionInputRules.ValidateItemInput(ItemAction.Authorise, "   ", null);
        }

        [Theory]
        [InlineData(ItemAction.Reject)]
        [InlineData(ItemAction.RequestInformation)]
        [InlineData(ItemAction.AuthoriseWithRecommendations)]
        public void ActionsThatNeedText_RefuseABlankComment(ItemAction action)
        {
            LifecycleException error = Assert.Throws<LifecycleException>(() => ActionInputRules.ValidateItemInput(action, "  ", null));
            Assert.Equal(LifecycleErrorCodes.DecisionField, error.Code);
        }

        [Fact]
        public void Reject_WithAReason_IsAccepted()
        {
            ActionInputRules.ValidateItemInput(ItemAction.Reject, "Outside appetite", null);
        }

        [Fact]
        public void Onward_WithoutADestinationAuthority_IsRefused()
        {
            LifecycleException error = Assert.Throws<LifecycleException>(() => ActionInputRules.ValidateItemInput(ItemAction.Onward, "Needs level 6", null));
            Assert.Equal(LifecycleErrorCodes.AuthorityMissingInput, error.Code);
        }

        [Fact]
        public void Onward_WithADestinationAndAComment_IsAccepted()
        {
            ActionInputRules.ValidateItemInput(ItemAction.Onward, "Needs level 6", Guid.NewGuid());
        }

        [Fact]
        public void CancellingAReferral_NeedsAReason()
        {
            Assert.Equal(
                LifecycleErrorCodes.CancelReason,
                Assert.Throws<LifecycleException>(() => ActionInputRules.ValidateParentInput(ParentAction.Cancel, "")).Code);
            ActionInputRules.ValidateParentInput(ParentAction.Cancel, "Client withdrew");
        }

        [Fact]
        public void AcceptingARejection_NeedsAnAcknowledgement()
        {
            Assert.Equal(
                LifecycleErrorCodes.AcknowledgementRequired,
                Assert.Throws<LifecycleException>(() => ActionInputRules.ValidateParentInput(ParentAction.CompleteRejected, null)).Code);
            ActionInputRules.ValidateParentInput(ParentAction.CompleteRejected, "Acknowledged");
        }

        [Fact]
        public void CompletingAPartialOutcome_DoesNotNeedText()
        {
            ActionInputRules.ValidateParentInput(ParentAction.CompletePartial, null);
        }

        [Theory]
        [InlineData("Authorise", ItemAction.Authorise)]
        [InlineData("reject", ItemAction.Reject)]
        [InlineData(" Onward ", ItemAction.Onward)]
        [InlineData("AuthoriseWithRecommendations", ItemAction.AuthoriseWithRecommendations)]
        public void ItemActionNames_AreParsedIgnoringCaseAndSpaces(string name, ItemAction expected)
        {
            Assert.Equal(expected, ActionNameParser.ParseItemAction(name));
        }

        [Theory]
        [InlineData("Submit", ParentAction.Submit)]
        [InlineData("completerejected", ParentAction.CompleteRejected)]
        public void ParentActionNames_AreParsedIgnoringCase(string name, ParentAction expected)
        {
            Assert.Equal(expected, ActionNameParser.ParseParentAction(name));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("Approve")]
        [InlineData("3")]
        public void UnknownActionNames_AreRefused_IncludingNumbersThatWouldMapToAnEnum(string name)
        {
            Assert.Equal(LifecycleErrorCodes.UnknownAction, Assert.Throws<LifecycleException>(() => ActionNameParser.ParseItemAction(name)).Code);
        }

        [Fact]
        public void AnItemActionName_IsNotAValidReferralAction()
        {
            Assert.Throws<LifecycleException>(() => ActionNameParser.ParseParentAction("Authorise"));
        }
    }
}
