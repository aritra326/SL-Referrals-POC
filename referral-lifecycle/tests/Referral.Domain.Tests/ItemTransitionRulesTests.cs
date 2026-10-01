using System;
using System.Linq;
using Referral.Domain;
using Xunit;

namespace Referral.Domain.Tests
{
    /// <summary>The item transition matrix (spec 11.4): which status each action may start from and where it leads.</summary>
    public class ItemTransitionRulesTests
    {
        private static readonly ItemStatus[] AwaitingApprover =
        {
            ItemStatus.Submitted, ItemStatus.InReview, ItemStatus.Resubmitted, ItemStatus.OnwardForApproval
        };

        [Theory]
        [InlineData(ItemStatus.Submitted)]
        [InlineData(ItemStatus.Resubmitted)]
        [InlineData(ItemStatus.OnwardForApproval)]
        public void StartReview_FromARoutedItem_MovesToInReview(ItemStatus from)
        {
            Assert.Equal(ItemStatus.InReview, ItemTransitionRules.GetTargetStatus(ItemAction.StartReview, from));
        }

        [Theory]
        [InlineData(ItemAction.Authorise, ItemStatus.Authorised)]
        [InlineData(ItemAction.AuthoriseWithRecommendations, ItemStatus.AuthorisedWithRecommendations)]
        [InlineData(ItemAction.AuthoriseWithConditions, ItemStatus.AuthorisedWithConditions)]
        [InlineData(ItemAction.Reject, ItemStatus.Rejected)]
        [InlineData(ItemAction.RequestInformation, ItemStatus.MoreInformationNeeded)]
        [InlineData(ItemAction.Onward, ItemStatus.OnwardForApproval)]
        public void DecisionActions_FromAnyItemAwaitingAnApprover_LeadToTheirOutcome(ItemAction action, ItemStatus expected)
        {
            foreach (ItemStatus from in AwaitingApprover)
            {
                Assert.Equal(expected, ItemTransitionRules.GetTargetStatus(action, from));
            }
        }

        [Theory]
        [InlineData(ItemAction.Authorise)]
        [InlineData(ItemAction.AuthoriseWithRecommendations)]
        [InlineData(ItemAction.Reject)]
        [InlineData(ItemAction.RequestInformation)]
        [InlineData(ItemAction.Onward)]
        [InlineData(ItemAction.StartReview)]
        public void ApproverActions_AreRefused_WhenTheItemIsStillDraftOrAlreadyFinished(ItemAction action)
        {
            foreach (ItemStatus from in new[] { ItemStatus.Draft, ItemStatus.RevisionDraft, ItemStatus.Authorised, ItemStatus.Rejected, ItemStatus.Cancelled })
            {
                LifecycleException error = Assert.Throws<LifecycleException>(() => ItemTransitionRules.GetTargetStatus(action, from));
                Assert.Equal(LifecycleErrorCodes.StatusConflict, error.Code);
            }
        }

        [Fact]
        public void StartReview_IsRefused_WhenTheItemIsAlreadyInReview()
        {
            Assert.Throws<LifecycleException>(() => ItemTransitionRules.GetTargetStatus(ItemAction.StartReview, ItemStatus.InReview));
        }

        [Theory]
        [InlineData(ItemStatus.MoreInformationNeeded)]
        [InlineData(ItemStatus.RevisionDraft)]
        public void Resubmit_FromInformationRequestOrRevision_MovesToResubmitted(ItemStatus from)
        {
            Assert.Equal(ItemStatus.Resubmitted, ItemTransitionRules.GetTargetStatus(ItemAction.Resubmit, from));
        }

        [Theory]
        [InlineData(ItemStatus.Draft)]
        [InlineData(ItemStatus.Submitted)]
        [InlineData(ItemStatus.Rejected)]
        public void Resubmit_IsRefused_FromAnyOtherStatus(ItemStatus from)
        {
            Assert.Throws<LifecycleException>(() => ItemTransitionRules.GetTargetStatus(ItemAction.Resubmit, from));
        }

        [Fact]
        public void CreateRevision_FromRejected_StartsANewRevisionDraft()
        {
            Assert.Equal(ItemStatus.RevisionDraft, ItemTransitionRules.GetTargetStatus(ItemAction.CreateRevision, ItemStatus.Rejected));
        }

        [Theory]
        [InlineData(ItemStatus.Authorised)]
        [InlineData(ItemStatus.Submitted)]
        [InlineData(ItemStatus.RevisionDraft)]
        public void CreateRevision_IsRefused_ForAnItemThatIsNotRejected(ItemStatus from)
        {
            Assert.Throws<LifecycleException>(() => ItemTransitionRules.GetTargetStatus(ItemAction.CreateRevision, from));
        }

        [Fact]
        public void ItemLevelCancel_IsNotSupported_BecauseCancellationIsAReferralOperation()
        {
            LifecycleException error = Assert.Throws<LifecycleException>(() => ItemTransitionRules.GetTargetStatus(ItemAction.Cancel, ItemStatus.Submitted));
            Assert.Equal(LifecycleErrorCodes.ActionUnsupported, error.Code);
        }

        [Fact]
        public void EveryStatusIsEitherOpenOrFinished_AndOnlyOpenStatusesAreOpen()
        {
            var open = new[]
            {
                ItemStatus.Draft, ItemStatus.Submitted, ItemStatus.InReview, ItemStatus.MoreInformationNeeded,
                ItemStatus.Resubmitted, ItemStatus.OnwardForApproval, ItemStatus.RevisionDraft
            };

            foreach (ItemStatus status in Enum.GetValues(typeof(ItemStatus)).Cast<ItemStatus>())
            {
                Assert.Equal(open.Contains(status), ItemStatusRules.IsOpen(status));
            }
        }
    }
}
