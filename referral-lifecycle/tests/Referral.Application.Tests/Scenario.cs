using System;
using Referral.Application;
using Referral.Domain;

namespace Referral.Application.Tests
{
    /// <summary>
    /// A ready-made referral with ONE item waiting for approval, an eligible approver and a valid authority.
    /// Tests change only the one thing they are about, so each test reads as a single rule.
    /// </summary>
    public class Scenario
    {
        public readonly FakeReferralRepository Repository = new FakeReferralRepository();
        public readonly FakeSettings Settings = new FakeSettings();
        public readonly FakeClock Clock = new FakeClock { UtcNow = new DateTime(2026, 10, 1, 9, 30, 0, DateTimeKind.Utc) };
        public readonly FakeTrace Trace = new FakeTrace();

        public readonly Guid ProductId = Guid.NewGuid();
        public readonly Guid PrimaryUnderwriterId = Guid.NewGuid();
        public readonly Guid ApproverId = Guid.NewGuid();
        public readonly Guid RequiredLevelId = Guid.NewGuid();

        public ParentRecord Parent;
        public ItemRecord Item;
        public AuthorityFacts Authority;

        public Scenario(ItemStatus itemStatus = ItemStatus.Submitted, ParentStatus parentStatus = ParentStatus.SentForApproval)
        {
            Repository.LevelRanks[RequiredLevelId] = 4;

            Parent = new ParentRecord
            {
                Id = Guid.NewGuid(),
                Status = parentStatus,
                HasEverBeenSubmitted = parentStatus != ParentStatus.Draft,
                PrimaryUnderwriterId = PrimaryUnderwriterId,
                ProductId = ProductId
            };
            Repository.Parents[Parent.Id] = Parent;

            Authority = NewAuthority(ApproverId, rank: 4);
            Item = AddItem("ITEM-1", itemStatus, Authority, ApproverId);
        }

        public ItemActionService ItemService()
        {
            return new ItemActionService(Repository, Settings, Clock, Trace);
        }

        public ParentActionService ParentService()
        {
            return new ParentActionService(Repository, Settings, Clock, Trace);
        }

        /// <summary>An eligible authority assignment for the given underwriter at the given level rank.</summary>
        public AuthorityFacts NewAuthority(Guid underwriterId, int rank)
        {
            var facts = new AuthorityFacts
            {
                AssignmentId = Guid.NewGuid(),
                ProductId = ProductId,
                UnderwriterId = underwriterId,
                IsActive = true,
                StatusIsCurrent = true,
                EffectiveFrom = new DateTime(2026, 9, 1),
                EffectiveTo = new DateTime(2027, 8, 31),
                LevelIsActive = true,
                LevelCanApproveReferrals = true,
                LevelRank = rank,
                LevelName = "Level " + rank
            };
            Repository.Authorities[facts.AssignmentId] = facts;
            Repository.UserNames[underwriterId] = "Underwriter " + underwriterId.ToString().Substring(0, 4);
            return facts;
        }

        /// <summary>Adds a complete item (every field the submit rules need is filled in).</summary>
        public ItemRecord AddItem(string label, ItemStatus status, AuthorityFacts authority, Guid approverId)
        {
            var item = new ItemRecord
            {
                Id = Guid.NewGuid(),
                ParentId = Parent.Id,
                Status = status,
                RowVersion = "1",
                IsCurrentRevision = true,
                RevisionNumber = 1,
                Label = label,
                AssignedApproverId = approverId,
                AuthorityAssignmentId = authority.AssignmentId,
                RequiredAuthorityLevelId = RequiredLevelId,
                ReferralReasonId = Guid.NewGuid(),
                CoverSectionId = Guid.NewGuid(),
                ItemSummary = "Summary",
                ReferralDetails = "Details",
                UnderwriterRationale = "Rationale",
                InformationResponse = "Response",
                ChangeSummary = "Change"
            };
            Repository.Items[item.Id] = item;
            return item;
        }

        public ItemActionRequest ItemRequest(string action, string comment = null, Guid? caller = null, Guid? newAuthority = null)
        {
            return new ItemActionRequest
            {
                ItemId = Item.Id,
                ActionName = action,
                Comment = comment,
                CallerId = caller ?? ApproverId,
                NewAuthorityId = newAuthority,
                CorrelationId = "test-correlation"
            };
        }

        public ParentActionRequest ParentRequest(string action, string comment = null, Guid? caller = null)
        {
            return new ParentActionRequest
            {
                ParentId = Parent.Id,
                ActionName = action,
                Comment = comment,
                CallerId = caller ?? PrimaryUnderwriterId,
                CorrelationId = "test-correlation"
            };
        }
    }
}
