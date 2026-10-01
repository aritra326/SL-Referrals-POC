using System;
using System.Linq;
using Referral.Application;
using Referral.Domain;
using Xunit;

namespace Referral.Application.Tests
{
    /// <summary>
    /// The onward picker: only assignments the Onward action would accept are offered.
    /// Team membership is deliberately not part of this; eligibility is the only rule.
    /// </summary>
    public class EligibleAuthorityServiceTests
    {
        private static EligibleAuthorityService ServiceFor(Scenario s)
        {
            return new EligibleAuthorityService(s.Repository, s.Settings, s.Clock, s.Trace);
        }

        private static AuthorityFacts Named(AuthorityFacts facts, string name)
        {
            facts.AssignmentName = name;
            facts.LevelName = "Level " + facts.LevelRank;
            return facts;
        }

        [Fact]
        public void AHigherEligibleAuthorityOfAnotherUser_IsOffered()
        {
            var s = new Scenario();
            AuthorityFacts higher = Named(s.NewAuthority(Guid.NewGuid(), 6), "Dana Lee - Marine Hull");

            var found = ServiceFor(s).Find(s.Item.Id, s.ApproverId);

            EligibleAuthority offered = Assert.Single(found);
            Assert.Equal(higher.AssignmentId, offered.AssignmentId);
            Assert.Equal("Dana Lee - Marine Hull", offered.AssignmentName);
            Assert.Equal("Level 6", offered.LevelName);
            Assert.Equal(6, offered.Rank);
        }

        [Fact]
        public void TheCurrentAssignmentAndEqualOrLowerLevels_AreNotOffered()
        {
            var s = new Scenario();
            Named(s.NewAuthority(Guid.NewGuid(), 4), "Same level");
            Named(s.NewAuthority(Guid.NewGuid(), 3), "Lower level");

            Assert.Empty(ServiceFor(s).Find(s.Item.Id, s.ApproverId));
        }

        [Fact]
        public void TheCallersOwnOtherAssignments_AreNotOffered()
        {
            var s = new Scenario();
            Named(s.NewAuthority(s.ApproverId, 7), "My other authority");

            Assert.Empty(ServiceFor(s).Find(s.Item.Id, s.ApproverId));
        }

        [Fact]
        public void IneligibleAuthorities_AreNotOffered_WhateverTheirLevel()
        {
            var s = new Scenario();
            Named(s.NewAuthority(Guid.NewGuid(), 6), "Expired").EffectiveTo = s.Clock.UtcNow.Date.AddDays(-1);
            Named(s.NewAuthority(Guid.NewGuid(), 6), "Other product").ProductId = Guid.NewGuid();
            Named(s.NewAuthority(Guid.NewGuid(), 6), "Suspended").IsActive = false;
            Named(s.NewAuthority(Guid.NewGuid(), 6), "Not current").StatusIsCurrent = false;
            Named(s.NewAuthority(Guid.NewGuid(), 6), "Disabled user").UnderwriterIsDisabled = true;
            Named(s.NewAuthority(Guid.NewGuid(), 6), "Cannot approve").LevelCanApproveReferrals = false;

            Assert.Empty(ServiceFor(s).Find(s.Item.Id, s.ApproverId));
        }

        [Fact]
        public void SeveralEligibleAuthorities_AreListedLowestRankFirstThenByName()
        {
            var s = new Scenario();
            Named(s.NewAuthority(Guid.NewGuid(), 7), "Zed - Seven");
            Named(s.NewAuthority(Guid.NewGuid(), 5), "Beta - Five");
            Named(s.NewAuthority(Guid.NewGuid(), 5), "Alpha - Five");

            var names = ServiceFor(s).Find(s.Item.Id, s.ApproverId).Select(a => a.AssignmentName).ToList();

            Assert.Equal(new[] { "Alpha - Five", "Beta - Five", "Zed - Seven" }, names);
        }

        [Fact]
        public void WhenLowerNumbersAreGreater_OnlyLowerNumbersAreOffered()
        {
            var s = new Scenario();
            s.Settings.Settings.RankDirection = RankDirection.LowerNumberGreater;
            s.Authority.LevelRank = 4;
            Named(s.NewAuthority(Guid.NewGuid(), 2), "Senior");
            Named(s.NewAuthority(Guid.NewGuid(), 6), "Junior");

            var found = ServiceFor(s).Find(s.Item.Id, s.ApproverId);

            Assert.Equal("Senior", Assert.Single(found).AssignmentName);
        }

        [Fact]
        public void OnlyTheAssignedApprover_MayAskForTheList()
        {
            var s = new Scenario();

            var error = Assert.Throws<LifecycleException>(() => ServiceFor(s).Find(s.Item.Id, s.PrimaryUnderwriterId));

            Assert.Equal(LifecycleErrorCodes.NotPermitted, error.Code);
        }

        [Fact]
        public void AnItemThatCannotBeSentOnward_IsRefused()
        {
            var s = new Scenario(ItemStatus.Authorised, ParentStatus.SentForApproval);

            Assert.Equal(LifecycleErrorCodes.StatusConflict, Assert.Throws<LifecycleException>(() => ServiceFor(s).Find(s.Item.Id, s.ApproverId)).Code);
        }

        [Fact]
        public void AClosedReferral_IsRefused()
        {
            var s = new Scenario(ItemStatus.Submitted, ParentStatus.Cancelled);

            Assert.Equal(LifecycleErrorCodes.StatusConflict, Assert.Throws<LifecycleException>(() => ServiceFor(s).Find(s.Item.Id, s.ApproverId)).Code);
        }

        [Fact]
        public void WhenTheCurrentAuthorityIsNoLongerEligible_NothingIsOffered_AndTheReasonIsGiven()
        {
            var s = new Scenario();
            s.Authority.EffectiveTo = s.Clock.UtcNow.Date.AddDays(-1);

            Assert.Equal(LifecycleErrorCodes.AuthorityExpired, Assert.Throws<LifecycleException>(() => ServiceFor(s).Find(s.Item.Id, s.ApproverId)).Code);
        }

        [Fact]
        public void WithoutAConfiguredRankDirection_TheListIsRefused()
        {
            var s = new Scenario();
            s.Settings.Settings.RankDirection = null;

            Assert.Equal(LifecycleErrorCodes.RankConfiguration, Assert.Throws<LifecycleException>(() => ServiceFor(s).Find(s.Item.Id, s.ApproverId)).Code);
        }

        [Fact]
        public void AReferralWithoutAProduct_OffersNothing()
        {
            var s = new Scenario();
            s.Parent.ProductId = null;

            // Without a product the current assignment cannot be shown eligible either, so the request is refused.
            Assert.Throws<LifecycleException>(() => ServiceFor(s).Find(s.Item.Id, s.ApproverId));
        }

        [Fact]
        public void TheListIsReadOnly()
        {
            var s = new Scenario();
            Named(s.NewAuthority(Guid.NewGuid(), 6), "Dana");

            ServiceFor(s).Find(s.Item.Id, s.ApproverId);

            Assert.Equal(0, s.Repository.WriteCount);
        }

        [Fact]
        public void EveryOfferedAuthority_IsAcceptedByTheOnwardAction()
        {
            var s = new Scenario();
            Named(s.NewAuthority(Guid.NewGuid(), 5), "Five");
            Named(s.NewAuthority(Guid.NewGuid(), 7), "Seven");
            var offered = ServiceFor(s).Find(s.Item.Id, s.ApproverId);

            foreach (EligibleAuthority authority in offered)
            {
                var fresh = new Scenario();
                AuthorityFacts again = Named(fresh.NewAuthority(Guid.NewGuid(), authority.Rank), authority.AssignmentName);

                fresh.ItemService().Execute(fresh.ItemRequest("Onward", "route", newAuthority: again.AssignmentId));

                Assert.Equal(ItemStatus.OnwardForApproval, fresh.Item.Status);
            }
        }
    }
}
