using System;
using Referral.Domain;

namespace Referral.Application
{
    /// <summary>
    /// Runs one action on one Referral Item (the slcrm_ExecuteReferralItemAction Custom API).
    /// Order of checks follows spec 16.5: current row, allowed status, caller, feature switch, input, authority.
    /// If anything throws, the plug-in transaction rolls back every write made so far.
    /// </summary>
    public class ItemActionService
    {
        private readonly IReferralRepository _repository;
        private readonly ILifecycleSettingsProvider _settings;
        private readonly IClock _clock;
        private readonly ITrace _trace;
        private readonly AuthorityChecker _authority;
        private readonly ParentRecalculator _recalculator;

        public ItemActionService(
            IReferralRepository repository,
            ILifecycleSettingsProvider settings,
            IClock clock,
            ITrace trace)
        {
            _repository = repository;
            _settings = settings;
            _clock = clock;
            _trace = trace;
            _authority = new AuthorityChecker(repository, clock);
            _recalculator = new ParentRecalculator(repository, clock, trace);
        }

        /// <summary>Returns the id of the affected item, or the new revision's id for CreateRevision.</summary>
        public Guid Execute(ItemActionRequest request)
        {
            ItemAction action = ActionNameParser.ParseItemAction(request.ActionName);
            _trace.Write("Item action " + action + " on item " + request.ItemId);

            ItemRecord item = _repository.GetItem(request.ItemId);
            ParentRecord parent = _repository.GetParent(item.ParentId);

            CallerRules.RequireCurrentRevision(item);
            CallerRules.RequireReferralOpen(parent);
            ItemStatus targetStatus = ItemTransitionRules.GetTargetStatus(action, item.Status);

            Guid resultId = item.Id;
            switch (action)
            {
                case ItemAction.StartReview:
                    StartReview(item, parent, request);
                    break;
                case ItemAction.Resubmit:
                    Resubmit(item, parent, request);
                    break;
                case ItemAction.CreateRevision:
                    resultId = CreateRevision(item, parent, request);
                    break;
                default:
                    RecordDecision(action, item, parent, request, targetStatus);
                    break;
            }

            _recalculator.Recalculate(item.ParentId);
            return resultId;
        }

        // ---------------------------------------------------------------------------------------------
        // Approver actions
        // ---------------------------------------------------------------------------------------------

        private void StartReview(ItemRecord item, ParentRecord parent, ItemActionRequest request)
        {
            CallerRules.RequireAssignedApprover(item, request.CallerId);
            _authority.RequireEligible(item.AuthorityAssignmentId, parent, item.RequiredAuthorityLevelId, _settings.Load().RequireRankDirection());

            _repository.UpdateItem(new ItemUpdate
            {
                Id = item.Id,
                ExpectedRowVersion = item.RowVersion,
                Status = ItemStatus.InReview,
                ReviewStartedOn = _clock.UtcNow
            });
        }

        /// <summary>Authorise, Authorise with Recommendations, Request Information, Onward and Reject all record a decision.</summary>
        private void RecordDecision(ItemAction action, ItemRecord item, ParentRecord parent, ItemActionRequest request, ItemStatus targetStatus)
        {
            CallerRules.RequireAssignedApprover(item, request.CallerId);
            DecisionType decisionType = GetDecisionType(action);
            ActionInputRules.ValidateItemInput(action, request.Comment, request.NewAuthorityId);

            LifecycleSettings settings = _settings.Load();
            RankDirection direction = settings.RequireRankDirection();
            AuthorityFacts current = _authority.RequireEligible(item.AuthorityAssignmentId, parent, item.RequiredAuthorityLevelId, direction);

            AuthorityFacts destination = null;
            if (action == ItemAction.Onward)
            {
                destination = RequireValidOnwardDestination(item, parent, request, current, direction);
            }

            _repository.CreateDecision(BuildDecision(action, decisionType, item, request, targetStatus, current, destination));

            _repository.UpdateItem(BuildItemUpdate(item, targetStatus, destination));
        }

        private AuthorityFacts RequireValidOnwardDestination(
            ItemRecord item, ParentRecord parent, ItemActionRequest request, AuthorityFacts current, RankDirection direction)
        {
            AuthorityFacts destination = _authority.RequireEligible(request.NewAuthorityId, parent, item.RequiredAuthorityLevelId, direction);

            if (destination.AssignmentId == current.AssignmentId || destination.UnderwriterId == request.CallerId)
            {
                throw new LifecycleException(LifecycleErrorCodes.OnwardRank, "An item cannot be sent onward to yourself or to the authority it already has.");
            }

            if (!RankRules.IsStrictlyHigher(destination.LevelRank.Value, current.LevelRank.Value, direction))
            {
                throw new LifecycleException(LifecycleErrorCodes.OnwardRank, "The authority you chose must be a higher level than the current one.");
            }

            return destination;
        }

        private NewDecision BuildDecision(
            ItemAction action, DecisionType decisionType, ItemRecord item, ItemActionRequest request,
            ItemStatus targetStatus, AuthorityFacts current, AuthorityFacts destination)
        {
            var decision = new NewDecision
            {
                ItemId = item.Id,
                ParentId = item.ParentId,
                DecisionType = decisionType,
                DecidedBy = request.CallerId,
                DecidedOn = _clock.UtcNow,
                Sequence = _repository.GetLastDecisionSequence(item.Id) + 1,
                ItemRevisionNumber = item.RevisionNumber,
                PreviousItemStatus = item.Status,
                NewItemStatus = targetStatus,
                AuthorityAssignmentUsedId = item.AuthorityAssignmentId,
                AuthorityLevelSnapshot = current.LevelName,
                AuthorityRankSnapshot = current.LevelRank,
                CorrelationId = request.CorrelationId
            };

            switch (action)
            {
                case ItemAction.AuthoriseWithRecommendations:
                    // The Recommendations column holds only 100 characters, so the full text is also kept in Comments.
                    decision.Recommendations = request.Comment;
                    decision.Comments = request.Comment;
                    break;
                case ItemAction.RequestInformation:
                    decision.InformationRequested = request.Comment;
                    break;
                case ItemAction.Reject:
                    decision.RejectionReason = request.Comment;
                    break;
                default:
                    decision.Comments = request.Comment;
                    break;
            }

            if (destination != null)
            {
                decision.OnwardAuthorityId = destination.AssignmentId;
                decision.OnwardApproverSnapshot = destination.UnderwriterId.HasValue
                    ? _repository.GetUserFullName(destination.UnderwriterId.Value)
                    : null;
            }

            return decision;
        }

        private static ItemUpdate BuildItemUpdate(ItemRecord item, ItemStatus targetStatus, AuthorityFacts onwardDestination)
        {
            var update = new ItemUpdate { Id = item.Id, ExpectedRowVersion = item.RowVersion, Status = targetStatus };

            if (onwardDestination != null)
            {
                // Routing moves the item to the new authority and its underwriter.
                update.AuthorityAssignmentId = onwardDestination.AssignmentId;
                update.AssignedApproverId = onwardDestination.UnderwriterId;
            }

            return update;
        }

        private DecisionType GetDecisionType(ItemAction action)
        {
            switch (action)
            {
                case ItemAction.Authorise:
                    return DecisionType.Authorised;
                case ItemAction.AuthoriseWithRecommendations:
                    return DecisionType.AuthorisedWithRecommendation;
                case ItemAction.RequestInformation:
                    return DecisionType.MoreInformationNeeded;
                case ItemAction.Onward:
                    return DecisionType.OnwardForApproval;
                case ItemAction.Reject:
                    return DecisionType.Rejected;
                case ItemAction.AuthoriseWithConditions:
                    RequireConditionalDecisionEnabled();
                    throw new LifecycleException(
                        LifecycleErrorCodes.ActionUnsupported,
                        "This environment has no 'conditions' decision type yet, so the decision cannot be recorded.");
                default:
                    throw new LifecycleException(LifecycleErrorCodes.UnknownAction, "Unsupported decision action '" + action + "'.");
            }
        }

        private void RequireConditionalDecisionEnabled()
        {
            if (!_settings.Load().EnableConditionalDecision)
            {
                throw new LifecycleException(LifecycleErrorCodes.FeatureDisabled, "Authorising with conditions is not enabled yet.");
            }
        }

        // ---------------------------------------------------------------------------------------------
        // Underwriter actions
        // ---------------------------------------------------------------------------------------------

        private void Resubmit(ItemRecord item, ParentRecord parent, ItemActionRequest request)
        {
            CallerRules.RequirePrimaryUnderwriter(parent, request.CallerId);
            RequireResponseText(item);

            // The assignment is re-checked because it may have expired while the item waited for a response.
            _authority.RequireEligible(item.AuthorityAssignmentId, parent, item.RequiredAuthorityLevelId, _settings.Load().RequireRankDirection());

            _repository.UpdateItem(new ItemUpdate
            {
                Id = item.Id,
                ExpectedRowVersion = item.RowVersion,
                Status = ItemStatus.Resubmitted,
                RespondedOn = _clock.UtcNow
            });
        }

        private static void RequireResponseText(ItemRecord item)
        {
            if (item.Status == ItemStatus.MoreInformationNeeded && string.IsNullOrWhiteSpace(item.InformationResponse))
            {
                throw new LifecycleException(LifecycleErrorCodes.ResubmitItem, "Enter your response to the information request before resubmitting.");
            }

            if (item.Status == ItemStatus.RevisionDraft && string.IsNullOrWhiteSpace(item.ChangeSummary))
            {
                throw new LifecycleException(LifecycleErrorCodes.ResubmitItem, "Enter a change summary before resubmitting the revision.");
            }
        }

        private Guid CreateRevision(ItemRecord item, ParentRecord parent, ItemActionRequest request)
        {
            CallerRules.RequirePrimaryUnderwriter(parent, request.CallerId);

            bool parentWaitingForUnderwriter = parent.Status == ParentStatus.RejectedActionRequired
                || parent.Status == ParentStatus.PartiallyAuthorisedActionRequired;
            if (!parentWaitingForUnderwriter)
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.RevisionState,
                    "A revision can only be started once every item has an outcome and the referral is waiting for the underwriter.");
            }

            if (_repository.HasSuccessorRevision(item.Id))
            {
                throw new LifecycleException(LifecycleErrorCodes.RevisionExists, "A revision of this item has already been started.");
            }

            return _repository.CreateRevision(item, _clock.UtcNow);
        }
    }
}
