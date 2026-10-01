using System;
using System.Linq;
using Referral.Application;
using Referral.Domain;
using Xunit;

namespace Referral.Application.Tests
{
    public class ItemActionServiceTests
    {
        private static LifecycleException Fails(Action action)
        {
            return Assert.Throws<LifecycleException>(action);
        }

        // -------------------------------------------------------------------------------------------
        // Authorise
        // -------------------------------------------------------------------------------------------

        [Fact]
        public void Authorise_WhenApproverIsEligible_RecordsADecisionAndUpdatesItemAndParent()
        {
            var s = new Scenario();

            Guid result = s.ItemService().Execute(s.ItemRequest("Authorise", "Looks fine"));

            Assert.Equal(s.Item.Id, result);
            Assert.Equal(ItemStatus.Authorised, s.Item.Status);
            Assert.Equal(ParentStatus.Authorised, s.Parent.Status);

            NewDecision decision = Assert.Single(s.Repository.Decisions);
            Assert.Equal(DecisionType.Authorised, decision.DecisionType);
            Assert.Equal("Looks fine", decision.Comments);
            Assert.Equal(s.ApproverId, decision.DecidedBy);
            Assert.Equal(s.Clock.UtcNow, decision.DecidedOn);
            Assert.Equal(1, decision.Sequence);
            Assert.Equal(ItemStatus.Submitted, decision.PreviousItemStatus);
            Assert.Equal(ItemStatus.Authorised, decision.NewItemStatus);
            Assert.Equal("test-correlation", decision.CorrelationId);
        }

        [Fact]
        public void Authorise_WithNoComment_IsAllowed()
        {
            var s = new Scenario();

            s.ItemService().Execute(s.ItemRequest("Authorise"));

            Assert.Equal(ItemStatus.Authorised, s.Item.Status);
        }

        [Fact]
        public void Authorise_RecordsTheAuthorityEvidenceUsedAtTheTime()
        {
            var s = new Scenario();

            s.ItemService().Execute(s.ItemRequest("Authorise"));

            NewDecision decision = s.Repository.Decisions.Single();
            Assert.Equal(s.Authority.AssignmentId, decision.AuthorityAssignmentUsedId);
            Assert.Equal("Level 4", decision.AuthorityLevelSnapshot);
            Assert.Equal(4, decision.AuthorityRankSnapshot);
        }

        [Fact]
        public void Authorise_WhenCallerIsNotTheAssignedApprover_IsRefusedAndNothingIsWritten()
        {
            var s = new Scenario();

            LifecycleException error = Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise", caller: Guid.NewGuid())));

            Assert.Equal(LifecycleErrorCodes.NotPermitted, error.Code);
            Assert.Equal(0, s.Repository.WriteCount);
            Assert.Equal(ItemStatus.Submitted, s.Item.Status);
        }

        [Fact]
        public void Authorise_WhenTheItemHasAlreadyBeenAuthorised_IsRefusedSoARetryCannotCreateASecondDecision()
        {
            var s = new Scenario();
            s.ItemService().Execute(s.ItemRequest("Authorise"));

            // Authorising the item makes the whole referral Authorised, so the retry is stopped at the referral.
            LifecycleException error = Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise")));

            Assert.Equal(LifecycleErrorCodes.StatusConflict, error.Code);
            Assert.Single(s.Repository.Decisions);
        }

        [Fact]
        public void Authorise_WhenTheItemWasAlreadyDecidedButTheReferralIsOpen_IsRefusedByTheItemStatus()
        {
            var s = new Scenario(ItemStatus.Authorised, ParentStatus.SentForApproval);

            LifecycleException error = Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise")));

            Assert.Equal(LifecycleErrorCodes.StatusConflict, error.Code);
            Assert.Empty(s.Repository.Decisions);
        }

        [Fact]
        public void Authorise_WhenTheItemRowChangedSinceItWasRead_IsRefusedAndTheStaleDecisionIsNotKept()
        {
            var s = new Scenario();
            var repository = new ConflictOnUpdateRepository(s.Repository);
            var service = new ItemActionService(repository, s.Settings, s.Clock, s.Trace);

            LifecycleException error = Fails(() => service.Execute(s.ItemRequest("Authorise")));

            Assert.Equal(LifecycleErrorCodes.ConcurrencyConflict, error.Code);
        }

        [Fact]
        public void Authorise_WhenTheItemHasBeenReplacedByARevision_IsRefused()
        {
            var s = new Scenario();
            s.Item.IsCurrentRevision = false;

            Assert.Equal(LifecycleErrorCodes.StatusConflict, Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise"))).Code);
        }

        [Fact]
        public void Authorise_WhenTheReferralIsClosed_IsRefused()
        {
            var s = new Scenario(ItemStatus.Submitted, ParentStatus.Cancelled);

            Assert.Equal(LifecycleErrorCodes.StatusConflict, Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise"))).Code);
        }

        [Fact]
        public void Authorise_WhenTheAuthorityHasExpired_IsRefusedAndNothingIsWritten()
        {
            var s = new Scenario();
            s.Authority.EffectiveTo = s.Clock.UtcNow.Date.AddDays(-1);

            LifecycleException error = Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise")));

            Assert.Equal(LifecycleErrorCodes.AuthorityExpired, error.Code);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void Authorise_WhenTheAuthorityLevelIsBelowTheRequiredLevel_IsRefused()
        {
            var s = new Scenario();
            s.Authority.LevelRank = 3;

            Assert.Equal(LifecycleErrorCodes.AuthorityRank, Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise"))).Code);
        }

        [Fact]
        public void Authorise_WhenTheAuthorityIsForADifferentProduct_IsRefused()
        {
            var s = new Scenario();
            s.Authority.ProductId = Guid.NewGuid();

            Assert.Equal(LifecycleErrorCodes.AuthorityProduct, Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise"))).Code);
        }

        [Fact]
        public void Authorise_WhenTheItemHasNoAuthorityAssignment_IsRefusedRatherThanApprovedBlindly()
        {
            var s = new Scenario();
            s.Item.AuthorityAssignmentId = null;

            Assert.Equal(LifecycleErrorCodes.AuthorityMissingInput, Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise"))).Code);
        }

        [Fact]
        public void Authorise_WhenTheRankDirectionIsNotConfigured_IsRefusedUntilAnAdministratorSetsIt()
        {
            var s = new Scenario();
            s.Settings.Settings.RankDirection = null;

            LifecycleException error = Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise")));

            Assert.Equal(LifecycleErrorCodes.RankConfiguration, error.Code);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void Authorise_WhenTheItemHasNoRequiredLevel_IsRefusedWithAClearMessage()
        {
            var s = new Scenario();
            s.Item.RequiredAuthorityLevelId = null;

            Assert.Equal(LifecycleErrorCodes.ValidationField, Fails(() => s.ItemService().Execute(s.ItemRequest("Authorise"))).Code);
        }

        [Fact]
        public void Authorise_TheSecondDecisionOnAnItemGetsTheNextSequenceNumber()
        {
            var s = new Scenario(ItemStatus.Resubmitted);
            s.Repository.Decisions.Add(new NewDecision { ItemId = s.Item.Id, Sequence = 1 });

            s.ItemService().Execute(s.ItemRequest("Authorise"));

            Assert.Equal(2, s.Repository.Decisions.Last().Sequence);
        }

        [Fact]
        public void AnUnknownActionName_IsRefused()
        {
            var s = new Scenario();

            Assert.Equal(LifecycleErrorCodes.UnknownAction, Fails(() => s.ItemService().Execute(s.ItemRequest("Approve"))).Code);
        }

        [Fact]
        public void AMissingItem_IsReportedAsNotFound()
        {
            var s = new Scenario();
            ItemActionRequest request = s.ItemRequest("Authorise");
            request.ItemId = Guid.NewGuid();

            Assert.Equal(LifecycleErrorCodes.NotFound, Fails(() => s.ItemService().Execute(request)).Code);
        }

        // -------------------------------------------------------------------------------------------
        // Reject
        // -------------------------------------------------------------------------------------------

        [Fact]
        public void Reject_WithAReason_RecordsTheReasonAndTheReferralNeedsUnderwriterAction()
        {
            var s = new Scenario();

            s.ItemService().Execute(s.ItemRequest("Reject", "Outside appetite"));

            Assert.Equal(ItemStatus.Rejected, s.Item.Status);
            Assert.Equal(ParentStatus.RejectedActionRequired, s.Parent.Status);
            NewDecision decision = s.Repository.Decisions.Single();
            Assert.Equal(DecisionType.Rejected, decision.DecisionType);
            Assert.Equal("Outside appetite", decision.RejectionReason);
        }

        [Fact]
        public void Reject_WithoutAReason_IsRefusedAndNothingIsWritten()
        {
            var s = new Scenario();

            LifecycleException error = Fails(() => s.ItemService().Execute(s.ItemRequest("Reject", "  ")));

            Assert.Equal(LifecycleErrorCodes.DecisionField, error.Code);
            Assert.Equal(0, s.Repository.WriteCount);
            Assert.Equal(ItemStatus.Submitted, s.Item.Status);
        }

        [Fact]
        public void Reject_WhenAnotherItemIsAlreadyAuthorised_TheReferralIsPartiallyAuthorised()
        {
            var s = new Scenario();
            s.AddItem("ITEM-2", ItemStatus.Authorised, s.Authority, s.ApproverId);

            s.ItemService().Execute(s.ItemRequest("Reject", "No"));

            Assert.Equal(ParentStatus.PartiallyAuthorisedActionRequired, s.Parent.Status);
        }

        [Fact]
        public void Reject_WhenAnotherItemIsStillWaiting_TheReferralStaysSentForApproval()
        {
            var s = new Scenario();
            s.AddItem("ITEM-2", ItemStatus.Submitted, s.Authority, s.ApproverId);

            s.ItemService().Execute(s.ItemRequest("Reject", "No"));

            Assert.Equal(ParentStatus.SentForApproval, s.Parent.Status);
        }

        [Fact]
        public void Reject_UpdatesTheParentCounts()
        {
            var s = new Scenario();
            s.AddItem("ITEM-2", ItemStatus.Authorised, s.Authority, s.ApproverId);

            s.ItemService().Execute(s.ItemRequest("Reject", "No"));

            ParentOutcome counts = s.Repository.LastCounts.Last();
            Assert.Equal(2, counts.TotalCount);
            Assert.Equal(1, counts.RejectedCount);
            Assert.Equal(1, counts.AuthorisedCount);
            Assert.Equal(0, counts.OpenCount);
        }

        // -------------------------------------------------------------------------------------------
        // The other decisions
        // -------------------------------------------------------------------------------------------

        [Fact]
        public void AuthoriseWithRecommendations_KeepsTheFullTextEvenThoughTheRecommendationsColumnIsShort()
        {
            var s = new Scenario();
            string longText = new string('r', 300);

            s.ItemService().Execute(s.ItemRequest("AuthoriseWithRecommendations", longText));

            NewDecision decision = s.Repository.Decisions.Single();
            Assert.Equal(DecisionType.AuthorisedWithRecommendation, decision.DecisionType);
            Assert.Equal(longText, decision.Recommendations);
            Assert.Equal(longText, decision.Comments);
            Assert.Equal(ParentStatus.AuthorisedWithRecommendations, s.Parent.Status);
        }

        [Fact]
        public void AuthoriseWithRecommendations_WithoutRecommendations_IsRefused()
        {
            var s = new Scenario();

            Assert.Equal(LifecycleErrorCodes.DecisionField, Fails(() => s.ItemService().Execute(s.ItemRequest("AuthoriseWithRecommendations"))).Code);
        }

        [Fact]
        public void AuthoriseWithConditions_WhileTheFeatureIsOff_IsRefused()
        {
            var s = new Scenario();

            LifecycleException error = Fails(() => s.ItemService().Execute(s.ItemRequest("AuthoriseWithConditions", "Subject to survey")));

            Assert.Equal(LifecycleErrorCodes.FeatureDisabled, error.Code);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void AuthoriseWithConditions_EvenWhenSwitchedOn_IsRefusedBecauseTheEnvironmentHasNoConditionsDecisionType()
        {
            var s = new Scenario();
            s.Settings.Settings.EnableConditionalDecision = true;

            LifecycleException error = Fails(() => s.ItemService().Execute(s.ItemRequest("AuthoriseWithConditions", "Subject to survey")));

            Assert.Equal(LifecycleErrorCodes.ActionUnsupported, error.Code);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void RequestInformation_MovesTheItemAndTheReferralToMoreInformation()
        {
            var s = new Scenario();

            s.ItemService().Execute(s.ItemRequest("RequestInformation", "Send the survey"));

            Assert.Equal(ItemStatus.MoreInformationNeeded, s.Item.Status);
            Assert.Equal(ParentStatus.MoreInformationRequired, s.Parent.Status);
            NewDecision decision = s.Repository.Decisions.Single();
            Assert.Equal(DecisionType.MoreInformationNeeded, decision.DecisionType);
            Assert.Equal("Send the survey", decision.InformationRequested);
        }

        [Fact]
        public void RequestInformation_WithoutSaying_WhatIsNeeded_IsRefused()
        {
            var s = new Scenario();

            Assert.Equal(LifecycleErrorCodes.DecisionField, Fails(() => s.ItemService().Execute(s.ItemRequest("RequestInformation"))).Code);
        }

        [Fact]
        public void ItemLevelCancel_IsRefusedWithAMessagePointingToTheReferralCancel()
        {
            var s = new Scenario();

            Assert.Equal(LifecycleErrorCodes.ActionUnsupported, Fails(() => s.ItemService().Execute(s.ItemRequest("Cancel", "x"))).Code);
        }

        // -------------------------------------------------------------------------------------------
        // Onward for approval
        // -------------------------------------------------------------------------------------------

        [Fact]
        public void Onward_ToAHigherEligibleAuthority_MovesTheItemToTheNewApproverAndRecordsTheEvidence()
        {
            var s = new Scenario();
            Guid newApprover = Guid.NewGuid();
            AuthorityFacts higher = s.NewAuthority(newApprover, rank: 6);

            s.ItemService().Execute(s.ItemRequest("Onward", "Needs level 6", newAuthority: higher.AssignmentId));

            Assert.Equal(ItemStatus.OnwardForApproval, s.Item.Status);
            Assert.Equal(higher.AssignmentId, s.Item.AuthorityAssignmentId);
            Assert.Equal(newApprover, s.Item.AssignedApproverId);
            Assert.Equal(ParentStatus.OnwardForApproval, s.Parent.Status);

            NewDecision decision = s.Repository.Decisions.Single();
            Assert.Equal(DecisionType.OnwardForApproval, decision.DecisionType);
            Assert.Equal(higher.AssignmentId, decision.OnwardAuthorityId);
            Assert.Equal(s.Repository.UserNames[newApprover], decision.OnwardApproverSnapshot);
            Assert.Equal("Needs level 6", decision.Comments);
        }

        [Fact]
        public void Onward_WithoutAChosenAuthority_IsRefused()
        {
            var s = new Scenario();

            Assert.Equal(LifecycleErrorCodes.AuthorityMissingInput, Fails(() => s.ItemService().Execute(s.ItemRequest("Onward", "x"))).Code);
        }

        [Fact]
        public void Onward_ToAnAuthorityOfTheSameLevel_IsRefused()
        {
            var s = new Scenario();
            AuthorityFacts sameLevel = s.NewAuthority(Guid.NewGuid(), rank: 4);

            LifecycleException error = Fails(() => s.ItemService().Execute(s.ItemRequest("Onward", "x", newAuthority: sameLevel.AssignmentId)));

            Assert.Equal(LifecycleErrorCodes.OnwardRank, error.Code);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void Onward_ToTheSamePerson_IsRefusedEvenAtAHigherLevel()
        {
            var s = new Scenario();
            AuthorityFacts mine = s.NewAuthority(s.ApproverId, rank: 6);

            Assert.Equal(LifecycleErrorCodes.OnwardRank, Fails(() => s.ItemService().Execute(s.ItemRequest("Onward", "x", newAuthority: mine.AssignmentId))).Code);
        }

        [Fact]
        public void Onward_ToAnIneligibleAuthority_IsRefused()
        {
            var s = new Scenario();
            AuthorityFacts expired = s.NewAuthority(Guid.NewGuid(), rank: 6);
            expired.EffectiveTo = s.Clock.UtcNow.Date.AddDays(-1);

            Assert.Equal(LifecycleErrorCodes.AuthorityExpired, Fails(() => s.ItemService().Execute(s.ItemRequest("Onward", "x", newAuthority: expired.AssignmentId))).Code);
        }

        [Fact]
        public void Onward_WhenLowerNumbersAreGreater_ChoosingALowerNumberIsHigherAuthority()
        {
            var s = new Scenario();
            s.Settings.Settings.RankDirection = RankDirection.LowerNumberGreater;
            s.Authority.LevelRank = 4;
            AuthorityFacts higher = s.NewAuthority(Guid.NewGuid(), rank: 2);

            s.ItemService().Execute(s.ItemRequest("Onward", "x", newAuthority: higher.AssignmentId));

            Assert.Equal(ItemStatus.OnwardForApproval, s.Item.Status);
        }

        // -------------------------------------------------------------------------------------------
        // Start review and resubmit
        // -------------------------------------------------------------------------------------------

        [Fact]
        public void StartReview_ByTheAssignedApprover_MovesTheItemToInReview()
        {
            var s = new Scenario();

            s.ItemService().Execute(s.ItemRequest("StartReview"));

            Assert.Equal(ItemStatus.InReview, s.Item.Status);
            Assert.Equal(ParentStatus.SentForApproval, s.Parent.Status);
            Assert.Empty(s.Repository.Decisions);
        }

        [Fact]
        public void StartReview_ByAnotherUser_IsRefused()
        {
            var s = new Scenario();

            Assert.Equal(LifecycleErrorCodes.NotPermitted, Fails(() => s.ItemService().Execute(s.ItemRequest("StartReview", caller: s.PrimaryUnderwriterId))).Code);
        }

        [Fact]
        public void Resubmit_WithAnInformationResponse_ReturnsTheItemForReview()
        {
            var s = new Scenario(ItemStatus.MoreInformationNeeded, ParentStatus.MoreInformationRequired);

            s.ItemService().Execute(s.ItemRequest("Resubmit", caller: s.PrimaryUnderwriterId));

            Assert.Equal(ItemStatus.Resubmitted, s.Item.Status);
            Assert.Equal(ParentStatus.SentForApproval, s.Parent.Status);
        }

        [Fact]
        public void Resubmit_WithoutAnInformationResponse_IsRefused()
        {
            var s = new Scenario(ItemStatus.MoreInformationNeeded, ParentStatus.MoreInformationRequired);
            s.Item.InformationResponse = " ";

            Assert.Equal(LifecycleErrorCodes.ResubmitItem, Fails(() => s.ItemService().Execute(s.ItemRequest("Resubmit", caller: s.PrimaryUnderwriterId))).Code);
        }

        [Fact]
        public void Resubmit_ByTheApproverInsteadOfThePrimaryUnderwriter_IsRefused()
        {
            var s = new Scenario(ItemStatus.MoreInformationNeeded, ParentStatus.MoreInformationRequired);

            Assert.Equal(LifecycleErrorCodes.NotPermitted, Fails(() => s.ItemService().Execute(s.ItemRequest("Resubmit"))).Code);
        }

        [Fact]
        public void Resubmit_WhenTheAuthorityExpiredWhileWaiting_IsRefusedSoItCanBeReassigned()
        {
            var s = new Scenario(ItemStatus.MoreInformationNeeded, ParentStatus.MoreInformationRequired);
            s.Authority.EffectiveTo = s.Clock.UtcNow.Date.AddDays(-1);

            Assert.Equal(LifecycleErrorCodes.AuthorityExpired, Fails(() => s.ItemService().Execute(s.ItemRequest("Resubmit", caller: s.PrimaryUnderwriterId))).Code);
        }

        // -------------------------------------------------------------------------------------------
        // Revisions
        // -------------------------------------------------------------------------------------------

        [Fact]
        public void CreateRevision_OfARejectedItem_StartsARevisionDraftAndTheReferralIsInRevision()
        {
            var s = new Scenario(ItemStatus.Rejected, ParentStatus.RejectedActionRequired);

            Guid newId = s.ItemService().Execute(s.ItemRequest("CreateRevision", caller: s.PrimaryUnderwriterId));

            Assert.NotEqual(s.Item.Id, newId);
            Assert.Equal(ItemStatus.Rejected, s.Item.Status);
            Assert.False(s.Item.IsCurrentRevision);
            Assert.Equal(ItemStatus.RevisionDraft, s.Repository.Items[newId].Status);
            Assert.Equal(2, s.Repository.Items[newId].RevisionNumber);
            Assert.Equal(ParentStatus.RevisionInProgress, s.Parent.Status);
        }

        [Fact]
        public void CreateRevision_WhenARevisionAlreadyExists_IsRefused()
        {
            var s = new Scenario(ItemStatus.Rejected, ParentStatus.RejectedActionRequired);
            s.Repository.ItemsWithSuccessor.Add(s.Item.Id);

            Assert.Equal(LifecycleErrorCodes.RevisionExists, Fails(() => s.ItemService().Execute(s.ItemRequest("CreateRevision", caller: s.PrimaryUnderwriterId))).Code);
        }

        [Fact]
        public void CreateRevision_WhileOtherItemsAreStillBeingDecided_IsRefused()
        {
            var s = new Scenario(ItemStatus.Rejected, ParentStatus.SentForApproval);

            Assert.Equal(LifecycleErrorCodes.RevisionState, Fails(() => s.ItemService().Execute(s.ItemRequest("CreateRevision", caller: s.PrimaryUnderwriterId))).Code);
        }

        [Fact]
        public void CreateRevision_ByAnyoneButThePrimaryUnderwriter_IsRefused()
        {
            var s = new Scenario(ItemStatus.Rejected, ParentStatus.RejectedActionRequired);

            Assert.Equal(LifecycleErrorCodes.NotPermitted, Fails(() => s.ItemService().Execute(s.ItemRequest("CreateRevision"))).Code);
        }

        [Fact]
        public void CreateRevision_OfAnItemThatWasNotRejected_IsRefused()
        {
            var s = new Scenario(ItemStatus.Authorised, ParentStatus.RejectedActionRequired);

            Assert.Equal(LifecycleErrorCodes.StatusConflict, Fails(() => s.ItemService().Execute(s.ItemRequest("CreateRevision", caller: s.PrimaryUnderwriterId))).Code);
        }

        /// <summary>Behaves like the normal repository but fails every item update as if someone else had edited the row.</summary>
        private class ConflictOnUpdateRepository : IReferralRepository
        {
            private readonly FakeReferralRepository _inner;

            public ConflictOnUpdateRepository(FakeReferralRepository inner)
            {
                _inner = inner;
            }

            public ItemRecord GetItem(Guid itemId) { return _inner.GetItem(itemId); }
            public ParentRecord GetParent(Guid parentId) { return _inner.GetParent(parentId); }
            public System.Collections.Generic.IList<ItemRecord> GetCurrentItems(Guid parentId) { return _inner.GetCurrentItems(parentId); }
            public bool HasSuccessorRevision(Guid itemId) { return _inner.HasSuccessorRevision(itemId); }
            public AuthorityFacts GetAuthority(Guid assignmentId) { return _inner.GetAuthority(assignmentId); }
            public int? GetAuthorityLevelRank(Guid levelId) { return _inner.GetAuthorityLevelRank(levelId); }
            public int GetLastDecisionSequence(Guid itemId) { return _inner.GetLastDecisionSequence(itemId); }
            public string GetUserFullName(Guid userId) { return _inner.GetUserFullName(userId); }
            public void UpdateParent(ParentUpdate update) { _inner.UpdateParent(update); }
            public Guid CreateDecision(NewDecision decision) { return _inner.CreateDecision(decision); }
            public Guid CreateRevision(ItemRecord item, DateTime nowUtc) { return _inner.CreateRevision(item, nowUtc); }

            public void UpdateItem(ItemUpdate update)
            {
                throw new LifecycleException(LifecycleErrorCodes.ConcurrencyConflict, "Someone else changed this item.");
            }
        }
    }
}
