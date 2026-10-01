using System.Collections.Generic;
using Referral.Domain;
using Xunit;

namespace Referral.Domain.Tests
{
    /// <summary>One test per row of the spec's aggregation truth table (section 11.7), plus boundary cases.</summary>
    public class ParentAggregatorTests
    {
        private static ParentOutcome Aggregate(bool submitted, bool cancelled, params ItemStatus[] items)
        {
            return ParentAggregator.Calculate(new List<ItemStatus>(items), submitted, cancelled);
        }

        private static ParentStatus Status(params ItemStatus[] items)
        {
            return Aggregate(true, false, items).Status;
        }

        [Fact]
        public void ExplicitlyCancelledReferral_IsCancelled_WhateverTheItemsAre()
        {
            Assert.Equal(ParentStatus.Cancelled, Aggregate(true, true, ItemStatus.Authorised, ItemStatus.Submitted).Status);
        }

        [Fact]
        public void ReferralWithNoItems_IsDraft()
        {
            Assert.Equal(ParentStatus.Draft, Status());
        }

        [Fact]
        public void ReferralWhereEveryItemIsDraft_IsDraft()
        {
            Assert.Equal(ParentStatus.Draft, Status(ItemStatus.Draft, ItemStatus.Draft));
        }

        [Fact]
        public void ReferralThatHasNeverBeenSubmitted_IsDraft_EvenIfAnItemLooksSubmitted()
        {
            Assert.Equal(ParentStatus.Draft, Aggregate(false, false, ItemStatus.Submitted).Status);
        }

        [Fact]
        public void InformationRequest_WinsOverARejectedSibling()
        {
            Assert.Equal(ParentStatus.MoreInformationRequired, Status(ItemStatus.MoreInformationNeeded, ItemStatus.Rejected));
        }

        [Fact]
        public void InformationRequest_WinsOverRevisionAndRoutedWork()
        {
            Assert.Equal(
                ParentStatus.MoreInformationRequired,
                Status(ItemStatus.MoreInformationNeeded, ItemStatus.RevisionDraft, ItemStatus.Submitted));
        }

        [Fact]
        public void RevisionDraft_IsRevisionInProgress_EvenWithTerminalSiblings()
        {
            Assert.Equal(ParentStatus.RevisionInProgress, Status(ItemStatus.RevisionDraft, ItemStatus.Authorised, ItemStatus.Rejected));
        }

        [Theory]
        [InlineData(ItemStatus.Submitted)]
        [InlineData(ItemStatus.InReview)]
        [InlineData(ItemStatus.Resubmitted)]
        public void OpenItemWaitingForApprover_PlusTerminalSibling_IsSentForApproval(ItemStatus waiting)
        {
            Assert.Equal(ParentStatus.SentForApproval, Status(waiting, ItemStatus.Authorised));
        }

        [Fact]
        public void EveryRoutedItemOnward_IsOnwardForApproval_EvenWithTerminalSiblings()
        {
            Assert.Equal(ParentStatus.OnwardForApproval, Status(ItemStatus.OnwardForApproval, ItemStatus.OnwardForApproval, ItemStatus.Rejected));
        }

        [Fact]
        public void OnwardMixedWithSubmitted_IsSentForApproval_NotOnward()
        {
            Assert.Equal(ParentStatus.SentForApproval, Status(ItemStatus.OnwardForApproval, ItemStatus.Submitted));
        }

        [Fact]
        public void AuthorisedPlusRejected_IsPartiallyAuthorisedActionRequired()
        {
            Assert.Equal(ParentStatus.PartiallyAuthorisedActionRequired, Status(ItemStatus.Authorised, ItemStatus.Rejected));
        }

        [Fact]
        public void EveryNonCancelledItemRejected_IsRejectedActionRequired()
        {
            Assert.Equal(ParentStatus.RejectedActionRequired, Status(ItemStatus.Rejected, ItemStatus.Rejected));
        }

        [Fact]
        public void RejectedPlusCancelled_IsRejectedActionRequired_CancelledItemsAreIgnored()
        {
            Assert.Equal(ParentStatus.RejectedActionRequired, Status(ItemStatus.Rejected, ItemStatus.Cancelled));
        }

        [Fact]
        public void Conditions_OutrankRecommendations()
        {
            Assert.Equal(
                ParentStatus.AuthorisedWithConditions,
                Status(ItemStatus.AuthorisedWithConditions, ItemStatus.AuthorisedWithRecommendations, ItemStatus.Authorised));
        }

        [Fact]
        public void Recommendations_OutrankPlainAuthorisation()
        {
            Assert.Equal(ParentStatus.AuthorisedWithRecommendations, Status(ItemStatus.AuthorisedWithRecommendations, ItemStatus.Authorised));
        }

        [Fact]
        public void EveryItemAuthorised_IsAuthorised()
        {
            Assert.Equal(ParentStatus.Authorised, Status(ItemStatus.Authorised, ItemStatus.Authorised));
        }

        [Fact]
        public void AuthorisedPlusCancelled_IsAuthorised_CancelledItemsAreIgnored()
        {
            Assert.Equal(ParentStatus.Authorised, Status(ItemStatus.Authorised, ItemStatus.Cancelled));
        }

        [Fact]
        public void EveryItemCancelledButReferralNotCancelled_IsAnInvariantError()
        {
            LifecycleException error = Assert.Throws<LifecycleException>(() => Status(ItemStatus.Cancelled, ItemStatus.Cancelled));
            Assert.Equal(LifecycleErrorCodes.AggregationAllCancelled, error.Code);
        }

        [Fact]
        public void ASupersededItemInTheCurrentSet_IsAnUnsupportedCombination()
        {
            LifecycleException error = Assert.Throws<LifecycleException>(() => Status(ItemStatus.Superseded, ItemStatus.Authorised));
            Assert.Equal(LifecycleErrorCodes.AggregationUnsupported, error.Code);
        }

        [Fact]
        public void Counts_AreCalculatedFromTheCurrentItems()
        {
            ParentOutcome outcome = Aggregate(
                true, false,
                ItemStatus.Authorised, ItemStatus.AuthorisedWithRecommendations, ItemStatus.Rejected,
                ItemStatus.Cancelled, ItemStatus.Submitted);

            Assert.Equal(5, outcome.TotalCount);
            Assert.Equal(1, outcome.OpenCount);
            Assert.Equal(2, outcome.AuthorisedCount);
            Assert.Equal(1, outcome.RejectedCount);
            Assert.Equal(1, outcome.CancelledCount);
        }
    }
}
