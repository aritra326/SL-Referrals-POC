using System;
using System.Collections.Generic;
using System.Linq;
using Referral.Application;
using Referral.Domain;
using Xunit;

namespace Referral.Application.Tests
{
    /// <summary>Application-level tests for the confirmed POC decisions.</summary>
    public class TeamRoleTests
    {
        private static void CreateTeams(Scenario s, bool requestorsContainPrimary = true, bool approversContainApprover = true)
        {
            s.Repository.Teams[ActionRoleRules.RequestorTeamName] = new HashSet<Guid>();
            s.Repository.Teams[ActionRoleRules.ApproverTeamName] = new HashSet<Guid>();
            if (requestorsContainPrimary) s.Repository.Teams[ActionRoleRules.RequestorTeamName].Add(s.PrimaryUnderwriterId);
            if (approversContainApprover) s.Repository.Teams[ActionRoleRules.ApproverTeamName].Add(s.ApproverId);
        }

        [Fact]
        public void AnApproverInTheApproverTeam_CanAuthorise()
        {
            var s = new Scenario();
            CreateTeams(s);

            s.ItemService().Execute(s.ItemRequest("Authorise"));

            Assert.Equal(ItemStatus.Authorised, s.Item.Status);
        }

        [Fact]
        public void TheAssignedApprover_WhoIsNotInTheApproverTeam_CannotAuthorise_AndNothingIsWritten()
        {
            var s = new Scenario();
            CreateTeams(s, approversContainApprover: false);

            var error = Assert.Throws<LifecycleException>(() => s.ItemService().Execute(s.ItemRequest("Authorise")));

            Assert.Equal(LifecycleErrorCodes.RoleRequired, error.Code);
            Assert.Contains(ActionRoleRules.ApproverTeamName, error.UserMessage);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void BeingInTheApproverTeam_DoesNotReplaceAuthorityEligibility()
        {
            var s = new Scenario();
            CreateTeams(s);
            s.Authority.EffectiveTo = s.Clock.UtcNow.Date.AddDays(-1);

            Assert.Equal(LifecycleErrorCodes.AuthorityExpired, Assert.Throws<LifecycleException>(() => s.ItemService().Execute(s.ItemRequest("Authorise"))).Code);
        }

        [Fact]
        public void BeingInTheApproverTeam_DoesNotMakeSomeoneTheAssignedApprover()
        {
            var s = new Scenario();
            CreateTeams(s);
            var otherApprover = Guid.NewGuid();
            s.Repository.Teams[ActionRoleRules.ApproverTeamName].Add(otherApprover);

            Assert.Equal(LifecycleErrorCodes.NotPermitted, Assert.Throws<LifecycleException>(() => s.ItemService().Execute(s.ItemRequest("Authorise", caller: otherApprover))).Code);
        }

        [Fact]
        public void ARequestor_CannotRunAnApproverAction_EvenAsThePrimaryUnderwriter()
        {
            var s = new Scenario();
            CreateTeams(s);

            var error = Assert.Throws<LifecycleException>(() => s.ItemService().Execute(s.ItemRequest("Reject", "no", caller: s.PrimaryUnderwriterId)));

            Assert.Equal(LifecycleErrorCodes.RoleRequired, error.Code);
        }

        [Fact]
        public void AnApprover_CannotSubmitOrCancelAReferral()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);
            CreateTeams(s);
            s.Repository.Teams[ActionRoleRules.RequestorTeamName].Clear();
            s.Parent.PrimaryUnderwriterId = s.ApproverId;

            foreach (string action in new[] { "Submit", "Cancel" })
            {
                var error = Assert.Throws<LifecycleException>(() => s.ParentService().Execute(s.ParentRequest(action, "why", caller: s.ApproverId)));
                Assert.Equal(LifecycleErrorCodes.RoleRequired, error.Code);
                Assert.Contains(ActionRoleRules.RequestorTeamName, error.UserMessage);
            }
        }

        [Fact]
        public void ARequestor_WhoIsThePrimaryUnderwriter_CanSubmit()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);
            CreateTeams(s);

            s.ParentService().Execute(s.ParentRequest("Submit"));

            Assert.Equal(ParentStatus.SentForApproval, s.Parent.Status);
        }

        [Fact]
        public void ARequestor_WhoIsNotThePrimaryUnderwriter_StillCannotSubmit()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);
            CreateTeams(s);
            var other = Guid.NewGuid();
            s.Repository.Teams[ActionRoleRules.RequestorTeamName].Add(other);

            Assert.Equal(LifecycleErrorCodes.NotPermitted, Assert.Throws<LifecycleException>(() => s.ParentService().Execute(s.ParentRequest("Submit", caller: other))).Code);
        }

        [Fact]
        public void AUserInBothTeams_CanDoBothKindsOfAction()
        {
            var s = new Scenario(ItemStatus.Submitted, ParentStatus.SentForApproval);
            s.Parent.PrimaryUnderwriterId = s.ApproverId;
            CreateTeams(s);
            s.Repository.Teams[ActionRoleRules.RequestorTeamName].Add(s.ApproverId);

            s.ItemService().Execute(s.ItemRequest("Reject", "no"));
            s.ItemService().Execute(s.ItemRequest("CreateRevision", caller: s.ApproverId));

            Assert.Equal(ParentStatus.RevisionInProgress, s.Parent.Status);
        }

        [Fact]
        public void ATeamThatDoesNotExistYet_IsNotEnforced()
        {
            var s = new Scenario();

            s.ItemService().Execute(s.ItemRequest("Authorise"));

            Assert.Equal(ItemStatus.Authorised, s.Item.Status);
            Assert.Contains(s.Trace.Lines, line => line.Contains("does not exist"));
        }

        [Fact]
        public void WhenTeamEnforcementIsSwitchedOff_NoTeamIsNeeded()
        {
            var s = new Scenario();
            CreateTeams(s, approversContainApprover: false);
            s.Settings.Settings.EnforceTeamRoles = false;

            s.ItemService().Execute(s.ItemRequest("Authorise"));

            Assert.Equal(ItemStatus.Authorised, s.Item.Status);
        }

        [Fact]
        public void TheOnwardPicker_NeedsTheApproverTeam_ButListsEligibleAssignments_NotTeamMembers()
        {
            var s = new Scenario();
            CreateTeams(s);
            var teamMemberWithoutAuthority = Guid.NewGuid();
            s.Repository.Teams[ActionRoleRules.ApproverTeamName].Add(teamMemberWithoutAuthority);
            AuthorityFacts higher = s.NewAuthority(Guid.NewGuid(), 6);
            higher.AssignmentName = "Dana - Marine Hull";
            higher.LevelName = "Level 6";

            var found = new EligibleAuthorityService(s.Repository, s.Settings, s.Clock, s.Trace).Find(s.Item.Id, s.ApproverId);

            Assert.Equal(higher.AssignmentId, Assert.Single(found).AssignmentId);
        }

        [Fact]
        public void TheOnwardPicker_IsRefusedToAnUserOutsideTheApproverTeam()
        {
            var s = new Scenario();
            CreateTeams(s, approversContainApprover: false);

            var error = Assert.Throws<LifecycleException>(() => new EligibleAuthorityService(s.Repository, s.Settings, s.Clock, s.Trace).Find(s.Item.Id, s.ApproverId));

            Assert.Equal(LifecycleErrorCodes.RoleRequired, error.Code);
        }
    }

    public class DecisionSnapshotTests
    {
        [Fact]
        public void ADecision_CapturesTheAuthorityEvidenceUsed()
        {
            var s = new Scenario();
            var levelId = Guid.NewGuid();
            s.Authority.LevelId = levelId;
            s.Authority.LevelName = "Level 5";
            s.Authority.LevelRank = 5;
            s.Authority.LevelCanApproveReferrals = true;

            s.ItemService().Execute(s.ItemRequest("Authorise"));

            NewDecision decision = s.Repository.Decisions.Single();
            Assert.Equal(s.Authority.AssignmentId, decision.AuthorityAssignmentUsedId);
            Assert.Equal(levelId, decision.AuthorityLevelUsedId);
            Assert.Equal("Level 5", decision.AuthorityLevelSnapshot);
            Assert.Equal(5, decision.AuthorityRankSnapshot);
            Assert.True(decision.CanApproveReferralsSnapshot);
            Assert.Equal(s.ApproverId, decision.DecidedBy);
            Assert.Equal(s.Clock.UtcNow, decision.DecidedOn);
        }

        [Fact]
        public void ChangingTheLiveAuthorityLevelLater_DoesNotChangeTheRecordedDecision()
        {
            var s = new Scenario();
            s.Authority.LevelId = Guid.NewGuid();
            s.Authority.LevelName = "Level 5";
            s.Authority.LevelRank = 5;
            s.ItemService().Execute(s.ItemRequest("Authorise"));

            s.Authority.LevelRank = 2;
            s.Authority.LevelName = "Renamed";
            s.Authority.LevelCanApproveReferrals = false;

            NewDecision decision = s.Repository.Decisions.Single();
            Assert.Equal(5, decision.AuthorityRankSnapshot);
            Assert.Equal("Level 5", decision.AuthorityLevelSnapshot);
            Assert.True(decision.CanApproveReferralsSnapshot);
        }

        [Fact]
        public void EveryKindOfDecision_CarriesTheSnapshot()
        {
            foreach (string action in new[] { "Authorise", "AuthoriseWithRecommendations", "Reject", "RequestInformation" })
            {
                var s = new Scenario();
                s.ItemService().Execute(s.ItemRequest(action, "text"));

                NewDecision decision = s.Repository.Decisions.Single();
                Assert.NotNull(decision.AuthorityRankSnapshot);
                Assert.NotNull(decision.CanApproveReferralsSnapshot);
                Assert.Equal(s.Authority.AssignmentId, decision.AuthorityAssignmentUsedId);
            }
        }
    }

    public class RevisionSupersedeTests
    {
        [Fact]
        public void TheRejectedItem_BecomesSuperseded_NotCurrent_AndKeepsItsDecisionHistory()
        {
            var s = new Scenario();
            s.ItemService().Execute(s.ItemRequest("Reject", "no"));
            int decisionsBefore = s.Repository.Decisions.Count;

            Guid revisionId = s.ItemService().Execute(s.ItemRequest("CreateRevision", caller: s.PrimaryUnderwriterId));

            Assert.Equal(ItemStatus.Superseded, s.Item.Status);
            Assert.False(s.Item.IsCurrentRevision);
            Assert.Equal(decisionsBefore, s.Repository.Decisions.Count);
            Assert.Equal(DecisionType.Rejected, s.Repository.Decisions.Single().DecisionType);
            Assert.Equal(ItemStatus.RevisionDraft, s.Repository.Items[revisionId].Status);
            Assert.True(s.Repository.Items[revisionId].IsCurrentRevision);
        }

        [Fact]
        public void ASupersededItem_CannotBeRevisedAgain()
        {
            var s = new Scenario();
            s.ItemService().Execute(s.ItemRequest("Reject", "no"));
            s.ItemService().Execute(s.ItemRequest("CreateRevision", caller: s.PrimaryUnderwriterId));

            Assert.Throws<LifecycleException>(() => s.ItemService().Execute(s.ItemRequest("CreateRevision", caller: s.PrimaryUnderwriterId)));
        }

        [Fact]
        public void TheSupersededRow_IsIgnoredWhenTheReferralStatusIsCalculated()
        {
            var s = new Scenario();
            s.ItemService().Execute(s.ItemRequest("Reject", "no"));
            s.ItemService().Execute(s.ItemRequest("CreateRevision", caller: s.PrimaryUnderwriterId));

            Assert.Equal(ParentStatus.RevisionInProgress, s.Parent.Status);
            Assert.Equal(1, s.Repository.LastCounts.Last().TotalCount);
        }
    }

    public class SubmitRuleSeamTests
    {
        private class MissingTagRule : ISubmitRule
        {
            public IEnumerable<string> FindProblems(ItemRecord item, ParentRecord parent)
            {
                if (item.ItemSummary != "tagged") yield return "a reason-specific tag";
            }
        }

        [Fact]
        public void ACustomRule_CanBeAddedWithoutChangingTheUseCase()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);
            var service = new ParentActionService(s.Repository, s.Settings, s.Clock, s.Trace, new SubmitValidator(new CommonSubmitFieldsRule(), new MissingTagRule()));

            var error = Assert.Throws<LifecycleException>(() => service.Execute(s.ParentRequest("Submit")));

            Assert.Contains("a reason-specific tag", error.UserMessage);
            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void TheCommonRuleAndACustomRule_ReportEveryProblemTogether()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);
            s.Item.UnderwriterRationale = null;
            var service = new ParentActionService(s.Repository, s.Settings, s.Clock, s.Trace, new SubmitValidator(new CommonSubmitFieldsRule(), new MissingTagRule()));

            var error = Assert.Throws<LifecycleException>(() => service.Execute(s.ParentRequest("Submit")));

            Assert.Contains("underwriter rationale", error.UserMessage);
            Assert.Contains("a reason-specific tag", error.UserMessage);
        }

        [Fact]
        public void ByDefault_OnlyTheCommonFieldsAreChecked_NoReasonSpecificFieldsAreInvented()
        {
            var s = new Scenario(ItemStatus.Draft, ParentStatus.Draft);

            s.ParentService().Execute(s.ParentRequest("Submit"));

            Assert.Equal(ItemStatus.Submitted, s.Item.Status);
        }

        [Fact]
        public void TheCommonRule_ChecksTheDecidedFields()
        {
            var item = new ItemRecord();

            var problems = new CommonSubmitFieldsRule().FindProblems(item, new ParentRecord()).ToList();

            Assert.Equal(
                new[] { "referral reason", "cover", "item summary", "referral details", "underwriter rationale", "required authority level", "underwriting authority", "assigned approver" },
                problems);
        }
    }

    public class ProductAndAcknowledgementTests
    {
        [Fact]
        public void ApproverEligibility_UsesTheReferralProduct()
        {
            var s = new Scenario();
            s.Parent.ProductId = Guid.NewGuid();

            Assert.Equal(LifecycleErrorCodes.AuthorityProduct, Assert.Throws<LifecycleException>(() => s.ItemService().Execute(s.ItemRequest("Authorise"))).Code);
        }

        [Theory]
        [InlineData("   ")]
        [InlineData("\n\t ")]
        [InlineData(null)]
        public void AcceptingARejection_NeedsAMeaningfulComment(string comment)
        {
            var s = new Scenario(ItemStatus.Rejected, ParentStatus.RejectedActionRequired);

            var error = Assert.Throws<LifecycleException>(() => s.ParentService().Execute(s.ParentRequest("CompleteRejected", comment)));

            Assert.Equal(LifecycleErrorCodes.AcknowledgementRequired, error.Code);
        }

        [Fact]
        public void TheAcknowledgementComment_IsStoredAsTheOutcomeSummary()
        {
            var s = new Scenario(ItemStatus.Rejected, ParentStatus.RejectedActionRequired);

            s.ParentService().Execute(s.ParentRequest("CompleteRejected", "I accept the rejected outcome."));

            Assert.Equal("I accept the rejected outcome.", s.Repository.LastParentUpdate.OutcomeSummary);
        }

        [Fact]
        public void CancellingAfterSomeItemsAreDecided_KeepsTheirDecisionsAndStatuses()
        {
            var s = new Scenario();
            s.AddItem("ITEM-2", ItemStatus.Authorised, s.Authority, s.ApproverId);
            s.ItemService().Execute(s.ItemRequest("Reject", "no"));
            int decisions = s.Repository.Decisions.Count;

            s.ParentService().Execute(s.ParentRequest("Cancel", "No longer needed"));

            Assert.Equal(ParentStatus.Cancelled, s.Parent.Status);
            Assert.Equal(ItemStatus.Rejected, s.Item.Status);
            Assert.Equal(ItemStatus.Authorised, s.Repository.Items.Values.Single(i => i.Label == "ITEM-2").Status);
            Assert.Equal(decisions, s.Repository.Decisions.Count);
        }

        [Fact]
        public void IfEveryItemIsCancelledWhileTheReferralStaysOpen_TheInvariantErrorIsRaised_NotAnInferredCancel()
        {
            var s = new Scenario();
            s.Item.Status = ItemStatus.Cancelled;

            var error = Assert.Throws<LifecycleException>(() => new ParentRecalculator(s.Repository, s.Clock, s.Trace).Recalculate(s.Parent.Id));

            Assert.Equal(LifecycleErrorCodes.AggregationAllCancelled, error.Code);
            Assert.Equal(ParentStatus.SentForApproval, s.Parent.Status);
        }

        [Fact]
        public void TheOnwardPicker_ShowsApproverLevelRankLicenceAndProduct()
        {
            var s = new Scenario();
            AuthorityFacts higher = s.NewAuthority(Guid.NewGuid(), 6);
            higher.AssignmentName = "Dana Lee - Marine Hull";
            higher.UnderwriterName = "Dana Lee";
            higher.LevelName = "Level 6";
            higher.LicenceScheme = "Lloyd's";
            higher.ProductName = "Marine Hull";

            EligibleAuthority offered = new EligibleAuthorityService(s.Repository, s.Settings, s.Clock, s.Trace).Find(s.Item.Id, s.ApproverId).Single();

            Assert.Equal("Dana Lee", offered.ApproverName);
            Assert.Equal("Level 6", offered.LevelName);
            Assert.Equal(6, offered.Rank);
            Assert.Equal("Lloyd's", offered.LicenceScheme);
            Assert.Equal("Marine Hull", offered.ProductName);
        }

        [Fact]
        public void PartialCompletion_IsAvailableWhenTheSettingIsOn()
        {
            var s = new Scenario(ItemStatus.Authorised, ParentStatus.PartiallyAuthorisedActionRequired);
            s.AddItem("ITEM-2", ItemStatus.Rejected, s.Authority, s.ApproverId);
            s.Settings.Settings.EnablePartialCompletion = true;

            s.ParentService().Execute(s.ParentRequest("CompletePartial", "Proceeding with the authorised scope"));

            Assert.Equal(ParentStatus.PartiallyAuthorisedCompleted, s.Parent.Status);
            Assert.Equal(ItemStatus.Rejected, s.Repository.Items.Values.Single(i => i.Label == "ITEM-2").Status);
        }
    }
}
