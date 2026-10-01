using System;
using System.Linq;
using Referral.Application;
using Referral.Domain;
using Xunit;

namespace Referral.Application.Tests
{
    public class ParentActionServiceTests
    {
        private static LifecycleException Fails(Action action)
        {
            return Assert.Throws<LifecycleException>(action);
        }

        // ---- Submit -------------------------------------------------------------------------------

        [Fact]
        public void Submit_WithACompleteDraftItem_RoutesItAndMarksTheReferralSubmitted()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);

            Guid result = s.ParentService().Execute(s.ParentRequest("Submit"));

            Assert.Equal(s.Parent.Id, result);
            Assert.Equal(ItemStatus.Submitted, s.Item.Status);
            Assert.True(s.Parent.HasEverBeenSubmitted);
            Assert.Equal(ParentStatus.SentForApproval, s.Parent.Status);
            Assert.Equal(1, s.Repository.LastCounts.Last().OpenCount);
        }

        [Fact]
        public void Submit_ByAnyoneButThePrimaryUnderwriter_IsRefusedAndNothingIsWritten()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);

            LifecycleException error = Fails(() => s.ParentService().Execute(s.ParentRequest("Submit", caller: Guid.NewGuid())));

            Assert.Equal(LifecycleErrorCodes.NotPermitted, error.Code);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void Submit_WhenTheReferralIsNotDraft_IsRefused()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.SentForApproval);

            Assert.Equal(LifecycleErrorCodes.StatusConflict, Fails(() => s.ParentService().Execute(s.ParentRequest("Submit"))).Code);
        }

        [Fact]
        public void Submit_WithNoDraftItems_IsRefused()
        {
            var s = new Scenario(ItemStatus.Submitted, ParentStatus.Draft);

            Assert.Equal(LifecycleErrorCodes.SubmitNoItems, Fails(() => s.ParentService().Execute(s.ParentRequest("Submit"))).Code);
        }

        [Fact]
        public void Submit_WhenAnItemIsMissingFields_ListsThemAndWritesNothing()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);
            s.Item.ItemSummary = null;
            s.Item.UnderwriterRationale = " ";

            LifecycleException error = Fails(() => s.ParentService().Execute(s.ParentRequest("Submit")));

            Assert.Equal(LifecycleErrorCodes.ValidationField, error.Code);
            Assert.Contains("item summary", error.UserMessage);
            Assert.Contains("underwriter rationale", error.UserMessage);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void Submit_WhenOneOfTwoItemsHasAnIneligibleAuthority_NoItemIsSubmitted()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);
            AuthorityFacts expired = s.NewAuthority(Guid.NewGuid(), 4);
            expired.EffectiveTo = s.Clock.UtcNow.Date.AddDays(-1);
            ItemRecord second = s.AddItem("ITEM-2", ItemStatus.Draft, expired, Guid.NewGuid());

            Assert.Equal(LifecycleErrorCodes.AuthorityExpired, Fails(() => s.ParentService().Execute(s.ParentRequest("Submit"))).Code);

            Assert.Equal(ItemStatus.Draft, s.Item.Status);
            Assert.Equal(ItemStatus.Draft, second.Status);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void Submit_WithoutAProductOnTheReferral_IsRefused()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);
            s.Parent.ProductId = null;

            Assert.Equal(LifecycleErrorCodes.ValidationField, Fails(() => s.ParentService().Execute(s.ParentRequest("Submit"))).Code);
        }

        [Fact]
        public void Submit_WhenTheRankDirectionIsNotConfigured_IsRefused()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);
            s.Settings.Settings.RankDirection = null;

            Assert.Equal(LifecycleErrorCodes.RankConfiguration, Fails(() => s.ParentService().Execute(s.ParentRequest("Submit"))).Code);
        }

        // ---- Submit revisions ---------------------------------------------------------------------

        [Fact]
        public void SubmitRevisions_ResubmitsEveryRevisionDraft()
        {
            var s = new Scenario(ItemStatus.RevisionDraft, ParentStatus.RevisionInProgress);

            s.ParentService().Execute(s.ParentRequest("SubmitRevisions"));

            Assert.Equal(ItemStatus.Resubmitted, s.Item.Status);
            Assert.Equal(ParentStatus.SentForApproval, s.Parent.Status);
        }

        [Fact]
        public void SubmitRevisions_WithoutAChangeSummary_IsRefused()
        {
            var s = new Scenario(ItemStatus.RevisionDraft, ParentStatus.RevisionInProgress);
            s.Item.ChangeSummary = null;

            Assert.Equal(LifecycleErrorCodes.ResubmitItem, Fails(() => s.ParentService().Execute(s.ParentRequest("SubmitRevisions"))).Code);
        }

        [Fact]
        public void SubmitRevisions_WhenTheReferralIsNotInRevision_IsRefused()
        {
            var s = new Scenario(ItemStatus.RevisionDraft, ParentStatus.SentForApproval);

            Assert.Equal(LifecycleErrorCodes.StatusConflict, Fails(() => s.ParentService().Execute(s.ParentRequest("SubmitRevisions"))).Code);
        }

        // ---- Complete partial / rejected ----------------------------------------------------------

        [Fact]
        public void CompletePartial_WhileTheFeatureIsOff_IsRefused()
        {
            var s = new Scenario(ItemStatus.Authorised, ParentStatus.PartiallyAuthorisedActionRequired);

            Assert.Equal(LifecycleErrorCodes.FeatureDisabled, Fails(() => s.ParentService().Execute(s.ParentRequest("CompletePartial"))).Code);
        }

        [Fact]
        public void CompletePartial_WhenSwitchedOn_ClosesTheReferralAsPartiallyAuthorisedCompleted()
        {
            var s = new Scenario(ItemStatus.Authorised, ParentStatus.PartiallyAuthorisedActionRequired);
            s.Settings.Settings.EnablePartialCompletion = true;

            s.ParentService().Execute(s.ParentRequest("CompletePartial", "Accepting reduced scope"));

            Assert.Equal(ParentStatus.PartiallyAuthorisedCompleted, s.Parent.Status);
            Assert.Equal("Accepting reduced scope", s.Repository.LastParentUpdate.OutcomeSummary);
            Assert.Equal(s.PrimaryUnderwriterId, s.Repository.LastParentUpdate.CompletedBy);
        }

        [Fact]
        public void CompletePartial_WhenTheReferralIsNotWaitingForThat_IsRefused()
        {
            var s = new Scenario(ItemStatus.Authorised, ParentStatus.RejectedActionRequired);
            s.Settings.Settings.EnablePartialCompletion = true;

            Assert.Equal(LifecycleErrorCodes.StatusConflict, Fails(() => s.ParentService().Execute(s.ParentRequest("CompletePartial"))).Code);
        }

        [Fact]
        public void CompleteRejected_WithAnAcknowledgement_ClosesTheReferralAsRejected()
        {
            var s = new Scenario(ItemStatus.Rejected, ParentStatus.RejectedActionRequired);

            s.ParentService().Execute(s.ParentRequest("CompleteRejected", "Acknowledged"));

            Assert.Equal(ParentStatus.Rejected, s.Parent.Status);
            Assert.False(ParentStatusRules.IsActive(s.Parent.Status));
        }

        [Fact]
        public void CompleteRejected_WithoutAnAcknowledgement_IsRefused()
        {
            var s = new Scenario(ItemStatus.Rejected, ParentStatus.RejectedActionRequired);

            Assert.Equal(LifecycleErrorCodes.AcknowledgementRequired, Fails(() => s.ParentService().Execute(s.ParentRequest("CompleteRejected"))).Code);
            Assert.Equal(ParentStatus.RejectedActionRequired, s.Parent.Status);
        }

        [Fact]
        public void CompleteRejected_WhenTheReferralIsNotRejectedActionRequired_IsRefused()
        {
            var s = new Scenario(ItemStatus.Authorised, ParentStatus.Authorised);

            Assert.Equal(LifecycleErrorCodes.StatusConflict, Fails(() => s.ParentService().Execute(s.ParentRequest("CompleteRejected", "x"))).Code);
        }

        // ---- Cancel -------------------------------------------------------------------------------

        [Fact]
        public void Cancel_CancelsOpenItemsKeepsFinishedOnesAndClosesTheReferral()
        {
            var s = new Scenario(ItemStatus.Submitted, ParentStatus.SentForApproval);
            ItemRecord authorised = s.AddItem("ITEM-2", ItemStatus.Authorised, s.Authority, s.ApproverId);

            s.ParentService().Execute(s.ParentRequest("Cancel", "Client withdrew"));

            Assert.Equal(ItemStatus.Cancelled, s.Item.Status);
            Assert.Equal(ItemStatus.Authorised, authorised.Status);
            Assert.Equal(ParentStatus.Cancelled, s.Parent.Status);
            Assert.True(s.Parent.ExplicitlyCancelled);
            Assert.Equal("Client withdrew", s.Repository.LastParentUpdate.CancellationReason);

            ParentOutcome counts = s.Repository.LastCounts.Last();
            Assert.Equal(1, counts.CancelledCount);
            Assert.Equal(1, counts.AuthorisedCount);
            Assert.Equal(0, counts.OpenCount);
        }

        [Fact]
        public void Cancel_WithoutAReason_IsRefusedAndNothingIsWritten()
        {
            var s = new Scenario();

            Assert.Equal(LifecycleErrorCodes.CancelReason, Fails(() => s.ParentService().Execute(s.ParentRequest("Cancel", " "))).Code);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void Cancel_WhenTheReferralIsAlreadyClosed_IsRefused()
        {
            var s = new Scenario(ItemStatus.Authorised, ParentStatus.Authorised);

            Assert.Equal(LifecycleErrorCodes.CancelTerminal, Fails(() => s.ParentService().Execute(s.ParentRequest("Cancel", "x"))).Code);
        }

        [Fact]
        public void AnItemActionName_IsRefusedOnAReferral()
        {
            var s = new Scenario();

            Assert.Equal(LifecycleErrorCodes.UnknownAction, Fails(() => s.ParentService().Execute(s.ParentRequest("Authorise"))).Code);
        }
    }
}
