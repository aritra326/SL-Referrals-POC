using System;
using System.Collections.Generic;
using System.Linq;
using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Referral.Application;
using Referral.Domain;

namespace Referral.Dataverse
{
    /// <summary>
    /// Reads and writes the referral tables for the use cases in Referral.Application.
    /// Each method asks Dataverse for only the columns it needs. Missing rows become SLR-NOTFOUND errors.
    /// </summary>
    public class ReferralRepository : IReferralRepository
    {
        /// <summary>Dataverse error code for "the record changed since you read it" (0x80060882).</summary>
        private const int ConcurrencyVersionMismatch = -2147088254;

        private readonly IOrganizationService _service;
        private readonly OptionValueResolver _options;

        public ReferralRepository(IOrganizationService service, OptionValueResolver options)
        {
            _service = service;
            _options = options;
        }

        // ---------------------------------------------------------------------------------------------
        // Reads
        // ---------------------------------------------------------------------------------------------

        private static readonly string[] ItemColumns =
        {
            Schema.StatusCode, Schema.Item.Parent, Schema.Item.IsCurrentRevision, Schema.Item.RevisionNumber,
            Schema.Item.ItemNumber, Schema.Item.ItemSummary, Schema.Item.ReferralDetails, Schema.Item.UnderwriterRationale,
            Schema.Item.InformationResponse, Schema.Item.ChangeSummary, Schema.Item.ReferralReason, Schema.Item.CoverSection,
            Schema.Item.RequiredAuthorityLevel, Schema.Item.AuthorityAssignment, Schema.Item.AssignedApprover
        };

        public ItemRecord GetItem(Guid itemId)
        {
            Entity row = RetrieveOrNull(Schema.Item.Table, itemId, ItemColumns);
            if (row == null)
            {
                throw NotFound("referral item");
            }

            return ToItemRecord(row);
        }

        public IList<ItemRecord> GetCurrentItems(Guid parentId)
        {
            var query = new QueryExpression(Schema.Item.Table) { ColumnSet = new ColumnSet(ItemColumns) };
            query.Criteria.AddCondition(Schema.Item.Parent, ConditionOperator.Equal, parentId);
            query.Criteria.AddCondition(Schema.Item.IsCurrentRevision, ConditionOperator.Equal, true);
            query.AddOrder("createdon", OrderType.Ascending);

            return _service.RetrieveMultiple(query).Entities.Select(ToItemRecord).ToList();
        }

        public bool HasSuccessorRevision(Guid itemId)
        {
            var query = new QueryExpression(Schema.Item.Table) { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition(Schema.Item.PreviousItem, ConditionOperator.Equal, itemId);
            return _service.RetrieveMultiple(query).Entities.Count > 0;
        }

        public ParentRecord GetParent(Guid parentId)
        {
            Entity row = RetrieveOrNull(
                Schema.Parent.Table,
                parentId,
                Schema.StatusCode,
                Schema.Parent.HasEverBeenSubmitted,
                Schema.Parent.ExplicitlyCancelled,
                Schema.Parent.PrimaryUnderwriter,
                Schema.Parent.Product);

            if (row == null)
            {
                throw NotFound("referral");
            }

            return new ParentRecord
            {
                Id = row.Id,
                Status = _options.ToParentStatus(row.GetAttributeValue<OptionSetValue>(Schema.StatusCode).Value),
                HasEverBeenSubmitted = row.GetAttributeValue<bool>(Schema.Parent.HasEverBeenSubmitted),
                ExplicitlyCancelled = row.GetAttributeValue<bool>(Schema.Parent.ExplicitlyCancelled),
                PrimaryUnderwriterId = IdOf(row, Schema.Parent.PrimaryUnderwriter),
                ProductId = IdOf(row, Schema.Parent.Product)
            };
        }

        private static readonly string[] AuthorityColumns =
        {
            Schema.StateCode, Schema.StatusCode, Schema.Authority.Name, Schema.Authority.EffectiveFrom, Schema.Authority.EffectiveTo,
            Schema.Authority.Level, Schema.Authority.Product, Schema.Authority.Underwriter, Schema.Authority.LicenceScheme
        };

        public AuthorityFacts GetAuthority(Guid assignmentId)
        {
            Entity assignment = RetrieveOrNull(Schema.Authority.Table, assignmentId, AuthorityColumns);
            return assignment == null ? null : ToAuthorityFacts(assignment);
        }

        public IList<AuthorityFacts> GetAuthoritiesForProduct(Guid productId)
        {
            var query = new QueryExpression(Schema.Authority.Table) { ColumnSet = new ColumnSet(AuthorityColumns) };
            query.Criteria.AddCondition(Schema.Authority.Product, ConditionOperator.Equal, productId);
            query.Criteria.AddCondition(Schema.StateCode, ConditionOperator.Equal, 0);

            return _service.RetrieveMultiple(query).Entities.Select(ToAuthorityFacts).ToList();
        }

        private AuthorityFacts ToAuthorityFacts(Entity assignment)
        {
            var facts = new AuthorityFacts
            {
                AssignmentId = assignment.Id,
                AssignmentName = assignment.GetAttributeValue<string>(Schema.Authority.Name),
                ProductId = IdOf(assignment, Schema.Authority.Product),
                ProductName = FormattedName(assignment, Schema.Authority.Product),
                LicenceScheme = FormattedName(assignment, Schema.Authority.LicenceScheme),
                UnderwriterId = IdOf(assignment, Schema.Authority.Underwriter),
                IsActive = assignment.GetAttributeValue<OptionSetValue>(Schema.StateCode).Value == 0,
                StatusIsCurrent = _options.IsCurrentAuthorityStatus(assignment.GetAttributeValue<OptionSetValue>(Schema.StatusCode).Value),
                EffectiveFrom = assignment.GetAttributeValue<DateTime?>(Schema.Authority.EffectiveFrom),
                EffectiveTo = assignment.GetAttributeValue<DateTime?>(Schema.Authority.EffectiveTo)
            };

            AddLevelFacts(facts, IdOf(assignment, Schema.Authority.Level));
            AddUnderwriterFacts(facts);
            return facts;
        }

        private void AddLevelFacts(AuthorityFacts facts, Guid? levelId)
        {
            if (!levelId.HasValue)
            {
                return;
            }

            Entity level = RetrieveOrNull(
                Schema.AuthorityLevel.Table,
                levelId.Value,
                Schema.StateCode,
                Schema.AuthorityLevel.Name,
                Schema.AuthorityLevel.Rank,
                Schema.AuthorityLevel.CanApprove);

            if (level == null)
            {
                return;
            }

            facts.LevelId = levelId;
            facts.LevelIsActive = level.GetAttributeValue<OptionSetValue>(Schema.StateCode).Value == 0;
            facts.LevelCanApproveReferrals = level.GetAttributeValue<bool>(Schema.AuthorityLevel.CanApprove);
            facts.LevelRank = level.GetAttributeValue<int?>(Schema.AuthorityLevel.Rank);
            facts.LevelName = level.GetAttributeValue<string>(Schema.AuthorityLevel.Name);
        }

        private void AddUnderwriterFacts(AuthorityFacts facts)
        {
            if (!facts.UnderwriterId.HasValue)
            {
                facts.UnderwriterIsDisabled = true;
                return;
            }

            Entity user = RetrieveOrNull(Schema.SystemUser.Table, facts.UnderwriterId.Value, Schema.SystemUser.IsDisabled, Schema.SystemUser.FullName);
            facts.UnderwriterIsDisabled = user == null || user.GetAttributeValue<bool>(Schema.SystemUser.IsDisabled);
            facts.UnderwriterName = user == null ? null : user.GetAttributeValue<string>(Schema.SystemUser.FullName);
        }

        public int? GetAuthorityLevelRank(Guid levelId)
        {
            Entity level = RetrieveOrNull(Schema.AuthorityLevel.Table, levelId, Schema.AuthorityLevel.Rank);
            return level == null ? null : level.GetAttributeValue<int?>(Schema.AuthorityLevel.Rank);
        }

        public int GetLastDecisionSequence(Guid itemId)
        {
            var query = new QueryExpression(Schema.Decision.Table)
            {
                ColumnSet = new ColumnSet(Schema.Decision.Sequence),
                TopCount = 1
            };
            query.Criteria.AddCondition(Schema.Decision.Item, ConditionOperator.Equal, itemId);
            query.AddOrder(Schema.Decision.Sequence, OrderType.Descending);

            Entity last = _service.RetrieveMultiple(query).Entities.FirstOrDefault();
            return last == null ? 0 : last.GetAttributeValue<int?>(Schema.Decision.Sequence).GetValueOrDefault();
        }

        public bool TeamExists(string teamName)
        {
            var query = new QueryExpression(Schema.Team.Table) { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition(Schema.Team.Name, ConditionOperator.Equal, teamName);
            return _service.RetrieveMultiple(query).Entities.Count > 0;
        }

        public bool IsTeamMember(Guid userId, string teamName)
        {
            var query = new QueryExpression(Schema.Team.Table) { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition(Schema.Team.Name, ConditionOperator.Equal, teamName);
            LinkEntity membership = query.AddLink(Schema.Team.MembershipTable, Schema.Team.MembershipTeam, Schema.Team.MembershipTeam);
            membership.LinkCriteria.AddCondition(Schema.Team.MembershipUser, ConditionOperator.Equal, userId);
            return _service.RetrieveMultiple(query).Entities.Count > 0;
        }

        public string GetUserFullName(Guid userId)
        {
            Entity user = RetrieveOrNull(Schema.SystemUser.Table, userId, Schema.SystemUser.FullName);
            return user == null ? null : user.GetAttributeValue<string>(Schema.SystemUser.FullName);
        }

        // ---------------------------------------------------------------------------------------------
        // Writes
        // ---------------------------------------------------------------------------------------------

        public void UpdateItem(ItemUpdate update)
        {
            var row = new Entity(Schema.Item.Table, update.Id);

            if (update.Status.HasValue)
            {
                SetStatus(row, _options.ForItemStatus(update.Status.Value));
            }

            SetIfHasValue(row, Schema.Item.ReviewStartedOn, update.ReviewStartedOn);
            SetIfHasValue(row, Schema.Item.SubmittedOn, update.SubmittedOn);
            SetIfHasValue(row, Schema.Item.RespondedOn, update.RespondedOn);
            SetLookup(row, Schema.Item.SubmittedBy, Schema.SystemUser.Table, update.SubmittedBy);
            SetLookup(row, Schema.Item.AuthorityAssignment, Schema.Authority.Table, update.AuthorityAssignmentId);
            SetLookup(row, Schema.Item.AssignedApprover, Schema.SystemUser.Table, update.AssignedApproverId);

            if (update.AssignedApproverId.HasValue)
            {
                row[Schema.Item.AssignedApproverSnapshot] = GetUserFullName(update.AssignedApproverId.Value);
            }

            if (string.IsNullOrEmpty(update.ExpectedRowVersion))
            {
                _service.Update(row);
                return;
            }

            UpdateIfUnchanged(row, update.ExpectedRowVersion);
        }

        /// <summary>Writes the row only if nobody changed it since it was read (the item table has optimistic concurrency on).</summary>
        private void UpdateIfUnchanged(Entity row, string expectedRowVersion)
        {
            row.RowVersion = expectedRowVersion;
            var request = new Microsoft.Xrm.Sdk.Messages.UpdateRequest
            {
                Target = row,
                ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches
            };

            try
            {
                _service.Execute(request);
            }
            catch (FaultException<OrganizationServiceFault> fault)
            {
                if (fault.Detail != null && fault.Detail.ErrorCode == ConcurrencyVersionMismatch)
                {
                    throw new LifecycleException(
                        LifecycleErrorCodes.ConcurrencyConflict,
                        "Someone else changed this item while you were working. Refresh the record and try again.");
                }

                throw;
            }
        }

        public void UpdateParent(ParentUpdate update)
        {
            var row = new Entity(Schema.Parent.Table, update.Id);

            if (update.Status.HasValue)
            {
                SetStatus(row, _options.ForParentStatus(update.Status.Value));
            }

            if (update.Counts != null)
            {
                row[Schema.Parent.TotalItemCount] = update.Counts.TotalCount;
                row[Schema.Parent.OpenItemCount] = update.Counts.OpenCount;
                row[Schema.Parent.OpenItemCountLegacy] = update.Counts.OpenCount;
                row[Schema.Parent.AuthorisedItemCount] = update.Counts.AuthorisedCount;
                row[Schema.Parent.RejectedItemCount] = update.Counts.RejectedCount;
                row[Schema.Parent.CancelledItemCount] = update.Counts.CancelledCount;
            }

            if (update.HasEverBeenSubmitted.HasValue) row[Schema.Parent.HasEverBeenSubmitted] = update.HasEverBeenSubmitted.Value;
            if (update.ExplicitlyCancelled.HasValue) row[Schema.Parent.ExplicitlyCancelled] = update.ExplicitlyCancelled.Value;
            if (update.CancellationReason != null) row[Schema.Parent.CancellationReason] = update.CancellationReason;
            if (update.OutcomeSummary != null) row[Schema.Parent.OutcomeSummary] = update.OutcomeSummary;

            SetIfHasValue(row, Schema.Parent.SubmittedOn, update.SubmittedOn);
            SetIfHasValue(row, Schema.Parent.LastSubmittedOn, update.LastSubmittedOn);
            SetIfHasValue(row, Schema.Parent.CompletedOn, update.CompletedOn);
            SetIfHasValue(row, Schema.Parent.LastAggregatedOn, update.LastAggregatedOn);
            SetLookup(row, Schema.Parent.SubmittedBy, Schema.SystemUser.Table, update.SubmittedBy);
            SetLookup(row, Schema.Parent.CompletedBy, Schema.SystemUser.Table, update.CompletedBy);

            _service.Update(row);
        }

        public Guid CreateDecision(NewDecision decision)
        {
            var row = new Entity(Schema.Decision.Table);

            row[Schema.Decision.Name] = "Decision " + decision.Sequence + " - " + OptionLabels.DecisionType[decision.DecisionType];
            row[Schema.Decision.Item] = new EntityReference(Schema.Item.Table, decision.ItemId);
            row[Schema.Decision.Parent] = new EntityReference(Schema.Parent.Table, decision.ParentId);
            row[Schema.Decision.DecisionBy] = new EntityReference(Schema.SystemUser.Table, decision.DecidedBy);
            row[Schema.Decision.DecisionOn] = decision.DecidedOn;
            row[Schema.Decision.DecisionType] = new OptionSetValue(_options.ForDecisionType(decision.DecisionType).Value);
            row[Schema.Decision.Sequence] = decision.Sequence;
            row[Schema.Decision.ItemRevisionNumber] = decision.ItemRevisionNumber;
            row[Schema.Decision.PreviousItemStatus] = OptionLabels.ItemStatus[decision.PreviousItemStatus];
            row[Schema.Decision.NewItemStatus] = OptionLabels.ItemStatus[decision.NewItemStatus];

            SetTextIfPresent(row, Schema.Decision.Comments, decision.Comments);
            SetTextIfPresent(row, Schema.Decision.InformationRequested, decision.InformationRequested);
            SetTextIfPresent(row, Schema.Decision.RejectedReason, decision.RejectionReason);
            SetTextIfPresent(row, Schema.Decision.OnwardApproverSnapshot, decision.OnwardApproverSnapshot);
            SetTextIfPresent(row, Schema.Decision.AuthorityLevelSnapshot, decision.AuthorityLevelSnapshot);
            SetTextIfPresent(row, Schema.Decision.CorrelationId, decision.CorrelationId);
            // Recommendations are narrative: written in full, never shortened.
            SetTextIfPresent(row, Schema.Decision.Recommendations, decision.Recommendations);

            if (decision.AuthorityRankSnapshot.HasValue) row[Schema.Decision.AuthorityRankSnapshot] = decision.AuthorityRankSnapshot.Value;
            if (decision.CanApproveReferralsSnapshot.HasValue) row[Schema.Decision.CanApproveReferralsSnapshot] = decision.CanApproveReferralsSnapshot.Value;
            SetLookup(row, Schema.Decision.AuthorityLevelUsed, Schema.AuthorityLevel.Table, decision.AuthorityLevelUsedId);
            SetLookup(row, Schema.Decision.OnwardAuthority, Schema.Authority.Table, decision.OnwardAuthorityId);
            SetLookup(row, Schema.Decision.AuthorityUsed, Schema.Authority.Table, decision.AuthorityAssignmentUsedId);

            return _service.Create(row);
        }

        public Guid CreateRevision(ItemRecord rejectedItem, DateTime nowUtc)
        {
            var columns = Schema.Item.CopiedToRevision
                .Concat(new[] { Schema.Item.LogicalItemId, Schema.Item.CurrentUniquenessKey, Schema.Item.RootItem })
                .ToArray();
            Entity source = RetrieveOrNull(Schema.Item.Table, rejectedItem.Id, columns);
            if (source == null)
            {
                throw NotFound("referral item");
            }

            // Stop the rejected row being "current" first, so only one current row exists for the item at any moment.
            var closeOld = new Entity(Schema.Item.Table, rejectedItem.Id);
            closeOld[Schema.Item.IsCurrentRevision] = false;
            closeOld[Schema.Item.SupersededOn] = nowUtc;
            closeOld[Schema.Item.CurrentUniquenessKey] = null;
            SetStatus(closeOld, _options.ForItemStatus(ItemStatus.Superseded));
            _service.Update(closeOld);

            var revision = new Entity(Schema.Item.Table);
            foreach (string column in Schema.Item.CopiedToRevision)
            {
                if (source.Contains(column))
                {
                    revision[column] = source[column];
                }
            }

            revision[Schema.Item.LogicalItemId] = source.GetAttributeValue<string>(Schema.Item.LogicalItemId);
            revision[Schema.Item.CurrentUniquenessKey] = source.GetAttributeValue<string>(Schema.Item.CurrentUniquenessKey);
            revision[Schema.Item.RevisionNumber] = rejectedItem.RevisionNumber + 1;
            revision[Schema.Item.IsCurrentRevision] = true;
            revision[Schema.Item.PreviousItem] = new EntityReference(Schema.Item.Table, rejectedItem.Id);
            revision[Schema.Item.RootItem] = source.GetAttributeValue<EntityReference>(Schema.Item.RootItem)
                                             ?? new EntityReference(Schema.Item.Table, rejectedItem.Id);
            SetStatus(revision, _options.ForItemStatus(ItemStatus.RevisionDraft));

            return _service.Create(revision);
        }

        // ---------------------------------------------------------------------------------------------
        // Small helpers
        // ---------------------------------------------------------------------------------------------

        private static ItemRecord ToItemRecordFields(Entity row)
        {
            string label = row.GetAttributeValue<string>(Schema.Item.ItemNumber)
                           ?? row.GetAttributeValue<string>(Schema.Item.ItemSummary)
                           ?? row.Id.ToString();

            return new ItemRecord
            {
                Id = row.Id,
                ParentId = row.GetAttributeValue<EntityReference>(Schema.Item.Parent).Id,
                RowVersion = row.RowVersion,
                IsCurrentRevision = row.GetAttributeValue<bool>(Schema.Item.IsCurrentRevision),
                RevisionNumber = row.GetAttributeValue<int?>(Schema.Item.RevisionNumber).GetValueOrDefault(),
                Label = label,
                AssignedApproverId = IdOf(row, Schema.Item.AssignedApprover),
                AuthorityAssignmentId = IdOf(row, Schema.Item.AuthorityAssignment),
                RequiredAuthorityLevelId = IdOf(row, Schema.Item.RequiredAuthorityLevel),
                ReferralReasonId = IdOf(row, Schema.Item.ReferralReason),
                CoverSectionId = IdOf(row, Schema.Item.CoverSection),
                ItemSummary = row.GetAttributeValue<string>(Schema.Item.ItemSummary),
                ReferralDetails = row.GetAttributeValue<string>(Schema.Item.ReferralDetails),
                UnderwriterRationale = row.GetAttributeValue<string>(Schema.Item.UnderwriterRationale),
                InformationResponse = row.GetAttributeValue<string>(Schema.Item.InformationResponse),
                ChangeSummary = row.GetAttributeValue<string>(Schema.Item.ChangeSummary)
            };
        }

        private ItemRecord ToItemRecord(Entity row)
        {
            ItemRecord record = ToItemRecordFields(row);
            record.Status = _options.ToItemStatus(row.GetAttributeValue<OptionSetValue>(Schema.StatusCode).Value);
            return record;
        }

        /// <summary>Retrieves one row, or null when it does not exist (a query avoids relying on exception types).</summary>
        private Entity RetrieveOrNull(string table, Guid id, params string[] columns)
        {
            var query = new QueryExpression(table) { ColumnSet = new ColumnSet(columns), TopCount = 1 };
            query.Criteria.AddCondition(table + "id", ConditionOperator.Equal, id);
            return _service.RetrieveMultiple(query).Entities.FirstOrDefault();
        }

        /// <summary>The label Dataverse shows for a lookup or choice column, or null when it has none.</summary>
        private static string FormattedName(Entity row, string column)
        {
            return row.FormattedValues.Contains(column) ? row.FormattedValues[column] : null;
        }

        private static Guid? IdOf(Entity row, string lookupColumn)
        {
            EntityReference reference = row.GetAttributeValue<EntityReference>(lookupColumn);
            return reference == null ? (Guid?)null : reference.Id;
        }

        private static void SetStatus(Entity row, OptionInfo option)
        {
            row[Schema.StatusCode] = new OptionSetValue(option.Value);
            row[Schema.StateCode] = new OptionSetValue(option.State.GetValueOrDefault());
        }

        private static void SetIfHasValue(Entity row, string column, DateTime? value)
        {
            if (value.HasValue)
            {
                row[column] = value.Value;
            }
        }

        private static void SetLookup(Entity row, string column, string targetTable, Guid? id)
        {
            if (id.HasValue)
            {
                row[column] = new EntityReference(targetTable, id.Value);
            }
        }

        private static void SetTextIfPresent(Entity row, string column, string value)
        {
            if (!string.IsNullOrEmpty(value))
            {
                row[column] = value;
            }
        }

        private static LifecycleException NotFound(string what)
        {
            return new LifecycleException(LifecycleErrorCodes.NotFound, "The " + what + " could not be found. It may have been deleted.");
        }
    }
}
