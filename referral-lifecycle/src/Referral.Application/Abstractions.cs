using System;
using System.Collections.Generic;
using Referral.Domain;

namespace Referral.Application
{
    /// <summary>
    /// Everything the use cases need from the data store. The Dataverse project implements it;
    /// the tests use an in-memory fake. Methods throw <see cref="LifecycleException"/> with code SLR-NOTFOUND for missing rows.
    /// </summary>
    public interface IReferralRepository
    {
        ItemRecord GetItem(Guid itemId);

        ParentRecord GetParent(Guid parentId);

        /// <summary>The current revision of every item on the referral, in a stable order.</summary>
        IList<ItemRecord> GetCurrentItems(Guid parentId);

        /// <summary>True when a newer revision already replaces this item.</summary>
        bool HasSuccessorRevision(Guid itemId);

        /// <summary>Null when the assignment does not exist.</summary>
        AuthorityFacts GetAuthority(Guid assignmentId);

        /// <summary>Every authority assignment recorded for the product (any status; the caller applies the eligibility rule).</summary>
        IList<AuthorityFacts> GetAuthoritiesForProduct(Guid productId);

        /// <summary>Null when the level does not exist or has no rank.</summary>
        int? GetAuthorityLevelRank(Guid levelId);

        /// <summary>The highest decision sequence already recorded for the item, or 0 when it has none.</summary>
        int GetLastDecisionSequence(Guid itemId);

        string GetUserFullName(Guid userId);

        /// <summary>True when a team with this exact name exists in the environment.</summary>
        bool TeamExists(string teamName);

        /// <summary>True when the user is a member of the named team.</summary>
        bool IsTeamMember(Guid userId, string teamName);

        void UpdateItem(ItemUpdate update);

        void UpdateParent(ParentUpdate update);

        /// <summary>Adds a Referral Decision row. Decisions are never updated or deleted afterwards.</summary>
        Guid CreateDecision(NewDecision decision);

        /// <summary>
        /// Starts a new revision of a rejected item. The old row stays as immutable evidence but stops being current,
        /// gets a Superseded On timestamp and the status Superseded (its rejection stays in Referral Decision history).
        /// The new row is a copy in "Revision Draft". Returns the new item's id.
        /// </summary>
        Guid CreateRevision(ItemRecord rejectedItem, DateTime nowUtc);
    }

    /// <summary>Reads the lifecycle settings (rank direction and feature switches).</summary>
    public interface ILifecycleSettingsProvider
    {
        LifecycleSettings Load();
    }

    public interface IClock
    {
        DateTime UtcNow { get; }
    }

    /// <summary>Writes a diagnostic line. Never pass personal or free-text narrative content.</summary>
    public interface ITrace
    {
        void Write(string message);
    }

    public sealed class SystemClock : IClock
    {
        public DateTime UtcNow
        {
            get { return DateTime.UtcNow; }
        }
    }
}
