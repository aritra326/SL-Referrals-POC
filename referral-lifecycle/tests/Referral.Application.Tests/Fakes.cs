using System;
using System.Collections.Generic;
using System.Linq;
using Referral.Application;
using Referral.Domain;

namespace Referral.Application.Tests
{
    public class FakeClock : IClock
    {
        public DateTime UtcNow { get; set; }
    }

    public class FakeTrace : ITrace
    {
        public List<string> Lines = new List<string>();

        public void Write(string message)
        {
            Lines.Add(message);
        }
    }

    public class FakeSettings : ILifecycleSettingsProvider
    {
        public LifecycleSettings Settings = new LifecycleSettings { RankDirection = RankDirection.HigherNumberGreater };

        public LifecycleSettings Load()
        {
            return Settings;
        }
    }

    /// <summary>An in-memory stand-in for Dataverse. It remembers every write so tests can check what was (not) written.</summary>
    public class FakeReferralRepository : IReferralRepository
    {
        public Dictionary<Guid, ItemRecord> Items = new Dictionary<Guid, ItemRecord>();
        public Dictionary<Guid, ParentRecord> Parents = new Dictionary<Guid, ParentRecord>();
        public Dictionary<Guid, AuthorityFacts> Authorities = new Dictionary<Guid, AuthorityFacts>();
        public Dictionary<Guid, int> LevelRanks = new Dictionary<Guid, int>();
        public Dictionary<Guid, string> UserNames = new Dictionary<Guid, string>();
        public List<NewDecision> Decisions = new List<NewDecision>();
        public List<ParentOutcome> LastCounts = new List<ParentOutcome>();
        public HashSet<Guid> ItemsWithSuccessor = new HashSet<Guid>();

        /// <summary>Number of write calls (item updates, parent updates, decisions, revisions).</summary>
        public int WriteCount;

        public ItemRecord GetItem(Guid itemId)
        {
            ItemRecord item;
            if (!Items.TryGetValue(itemId, out item))
            {
                throw new LifecycleException(LifecycleErrorCodes.NotFound, "The referral item could not be found.");
            }

            return item;
        }

        public ParentRecord GetParent(Guid parentId)
        {
            ParentRecord parent;
            if (!Parents.TryGetValue(parentId, out parent))
            {
                throw new LifecycleException(LifecycleErrorCodes.NotFound, "The referral could not be found.");
            }

            return parent;
        }

        public IList<ItemRecord> GetCurrentItems(Guid parentId)
        {
            return Items.Values.Where(i => i.ParentId == parentId && i.IsCurrentRevision).OrderBy(i => i.Label).ToList();
        }

        public bool HasSuccessorRevision(Guid itemId)
        {
            return ItemsWithSuccessor.Contains(itemId);
        }

        public AuthorityFacts GetAuthority(Guid assignmentId)
        {
            AuthorityFacts facts;
            return Authorities.TryGetValue(assignmentId, out facts) ? facts : null;
        }

        public int? GetAuthorityLevelRank(Guid levelId)
        {
            int rank;
            return LevelRanks.TryGetValue(levelId, out rank) ? rank : (int?)null;
        }

        public int GetLastDecisionSequence(Guid itemId)
        {
            return Decisions.Where(d => d.ItemId == itemId).Select(d => d.Sequence).DefaultIfEmpty(0).Max();
        }

        public string GetUserFullName(Guid userId)
        {
            string name;
            return UserNames.TryGetValue(userId, out name) ? name : null;
        }

        public void UpdateItem(ItemUpdate update)
        {
            WriteCount++;
            ItemRecord item = GetItem(update.Id);

            if (update.ExpectedRowVersion != null && update.ExpectedRowVersion != item.RowVersion)
            {
                throw new LifecycleException(LifecycleErrorCodes.ConcurrencyConflict, "Someone else changed this item.");
            }

            if (update.Status.HasValue) item.Status = update.Status.Value;
            if (update.AuthorityAssignmentId.HasValue) item.AuthorityAssignmentId = update.AuthorityAssignmentId;
            if (update.AssignedApproverId.HasValue) item.AssignedApproverId = update.AssignedApproverId;
            item.RowVersion = (int.Parse(item.RowVersion ?? "0") + 1).ToString();
        }

        public void UpdateParent(ParentUpdate update)
        {
            WriteCount++;
            ParentRecord parent = GetParent(update.Id);

            if (update.Status.HasValue) parent.Status = update.Status.Value;
            if (update.HasEverBeenSubmitted.HasValue) parent.HasEverBeenSubmitted = update.HasEverBeenSubmitted.Value;
            if (update.ExplicitlyCancelled.HasValue) parent.ExplicitlyCancelled = update.ExplicitlyCancelled.Value;
            if (update.Counts != null) LastCounts.Add(update.Counts);
            LastParentUpdate = update;
        }

        public ParentUpdate LastParentUpdate;

        public Guid CreateDecision(NewDecision decision)
        {
            WriteCount++;
            Decisions.Add(decision);
            return Guid.NewGuid();
        }

        public Guid CreateRevision(ItemRecord rejectedItem, DateTime nowUtc)
        {
            WriteCount++;
            rejectedItem.IsCurrentRevision = false;
            ItemsWithSuccessor.Add(rejectedItem.Id);

            var revision = new ItemRecord
            {
                Id = Guid.NewGuid(),
                ParentId = rejectedItem.ParentId,
                Status = ItemStatus.RevisionDraft,
                IsCurrentRevision = true,
                RevisionNumber = rejectedItem.RevisionNumber + 1,
                Label = rejectedItem.Label + "-R",
                RowVersion = "1"
            };
            Items[revision.Id] = revision;
            return revision.Id;
        }
    }
}
