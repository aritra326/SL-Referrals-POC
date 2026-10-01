using System;
using System.Collections.Generic;
using System.Linq;
using Referral.Domain;

namespace Referral.Application
{
    /// <summary>
    /// Runs one action on a Referral Request (the slcrm_ExecuteReferralRequestAction Custom API).
    /// Every action first checks the caller is the referral's primary underwriter. If anything throws,
    /// the plug-in transaction rolls back every write made so far.
    /// </summary>
    public class ParentActionService
    {
        private readonly IReferralRepository _repository;
        private readonly ILifecycleSettingsProvider _settings;
        private readonly IClock _clock;
        private readonly ITrace _trace;
        private readonly AuthorityChecker _authority;
        private readonly ActionRoleChecker _roles;
        private readonly SubmitValidator _submitValidator;
        private readonly ParentRecalculator _recalculator;

        public ParentActionService(
            IReferralRepository repository,
            ILifecycleSettingsProvider settings,
            IClock clock,
            ITrace trace,
            SubmitValidator submitValidator = null)
        {
            _repository = repository;
            _settings = settings;
            _clock = clock;
            _trace = trace;
            _authority = new AuthorityChecker(repository, clock);
            _roles = new ActionRoleChecker(repository, settings, trace);
            _submitValidator = submitValidator ?? new SubmitValidator();
            _recalculator = new ParentRecalculator(repository, clock, trace);
        }

        /// <summary>Returns the id of the referral.</summary>
        public Guid Execute(ParentActionRequest request)
        {
            ParentAction action = ActionNameParser.ParseParentAction(request.ActionName);
            _trace.Write("Referral action " + action + " on referral " + request.ParentId);

            ParentRecord parent = _repository.GetParent(request.ParentId);
            _roles.Require(ActionRoleRules.RoleFor(action), request.CallerId);
            CallerRules.RequirePrimaryUnderwriter(parent, request.CallerId);

            switch (action)
            {
                case ParentAction.Submit:
                    Submit(parent, request);
                    break;
                case ParentAction.SubmitRevisions:
                    SubmitRevisions(parent, request);
                    break;
                case ParentAction.CompletePartial:
                    CompletePartial(parent, request);
                    break;
                case ParentAction.CompleteRejected:
                    CompleteRejected(parent, request);
                    break;
                default:
                    Cancel(parent, request);
                    break;
            }

            return parent.Id;
        }

        // ---------------------------------------------------------------------------------------------
        // Submit and resubmit
        // ---------------------------------------------------------------------------------------------

        private void Submit(ParentRecord parent, ParentActionRequest request)
        {
            RequireParentStatus(parent, ParentStatus.Draft, "submitted");
            RequireProduct(parent);

            List<ItemRecord> drafts = _repository.GetCurrentItems(parent.Id).Where(i => i.Status == ItemStatus.Draft).ToList();
            if (drafts.Count == 0)
            {
                throw new LifecycleException(LifecycleErrorCodes.SubmitNoItems, "Add at least one referral item before submitting.");
            }

            RankDirection direction = _settings.Load().RequireRankDirection();
            foreach (ItemRecord item in drafts)
            {
                _submitValidator.Require(item, parent);
                _authority.RequireEligible(item.AuthorityAssignmentId, parent, item.RequiredAuthorityLevelId, direction);
            }

            DateTime now = _clock.UtcNow;
            foreach (ItemRecord item in drafts.OrderBy(i => i.Id))
            {
                _repository.UpdateItem(new ItemUpdate
                {
                    Id = item.Id,
                    ExpectedRowVersion = item.RowVersion,
                    Status = ItemStatus.Submitted,
                    SubmittedOn = now,
                    SubmittedBy = request.CallerId
                });
            }

            var parentUpdate = new ParentUpdate { Id = parent.Id, LastSubmittedOn = now };
            if (!parent.HasEverBeenSubmitted)
            {
                parentUpdate.HasEverBeenSubmitted = true;
                parentUpdate.SubmittedOn = now;
                parentUpdate.SubmittedBy = request.CallerId;
            }

            _repository.UpdateParent(parentUpdate);
            _recalculator.Recalculate(parent.Id);
        }

        private void SubmitRevisions(ParentRecord parent, ParentActionRequest request)
        {
            RequireParentStatus(parent, ParentStatus.RevisionInProgress, "have revisions submitted");

            List<ItemRecord> revisions = _repository.GetCurrentItems(parent.Id).Where(i => i.Status == ItemStatus.RevisionDraft).ToList();
            if (revisions.Count == 0)
            {
                throw new LifecycleException(LifecycleErrorCodes.ResubmitItem, "There are no revision drafts to submit.");
            }

            RankDirection direction = _settings.Load().RequireRankDirection();
            foreach (ItemRecord item in revisions)
            {
                if (string.IsNullOrWhiteSpace(item.ChangeSummary))
                {
                    throw new LifecycleException(
                        LifecycleErrorCodes.ResubmitItem,
                        "Enter a change summary on item " + item.Label + " before submitting the revision.");
                }

                _submitValidator.Require(item, parent);
                _authority.RequireEligible(item.AuthorityAssignmentId, parent, item.RequiredAuthorityLevelId, direction);
            }

            DateTime now = _clock.UtcNow;
            foreach (ItemRecord item in revisions.OrderBy(i => i.Id))
            {
                _repository.UpdateItem(new ItemUpdate { Id = item.Id, ExpectedRowVersion = item.RowVersion, Status = ItemStatus.Resubmitted, RespondedOn = now });
            }

            _repository.UpdateParent(new ParentUpdate { Id = parent.Id, LastSubmittedOn = now });
            _recalculator.Recalculate(parent.Id);
        }

        private static void RequireProduct(ParentRecord parent)
        {
            if (!parent.ProductId.HasValue)
            {
                throw new LifecycleException(LifecycleErrorCodes.ValidationField, "Choose the product on the referral before submitting.");
            }
        }

        // ---------------------------------------------------------------------------------------------
        // Completing and cancelling
        // ---------------------------------------------------------------------------------------------

        private void CompletePartial(ParentRecord parent, ParentActionRequest request)
        {
            if (!_settings.Load().EnablePartialCompletion)
            {
                throw new LifecycleException(LifecycleErrorCodes.FeatureDisabled, "Completing a partial outcome is not enabled yet.");
            }

            RequireParentStatus(parent, ParentStatus.PartiallyAuthorisedActionRequired, "completed as partially authorised");
            Close(parent, request, ParentStatus.PartiallyAuthorisedCompleted);
        }

        private void CompleteRejected(ParentRecord parent, ParentActionRequest request)
        {
            RequireParentStatus(parent, ParentStatus.RejectedActionRequired, "closed as rejected");
            ActionInputRules.ValidateParentInput(ParentAction.CompleteRejected, request.Comment);
            Close(parent, request, ParentStatus.Rejected);
        }

        private void Close(ParentRecord parent, ParentActionRequest request, ParentStatus finalStatus)
        {
            _repository.UpdateParent(new ParentUpdate
            {
                Id = parent.Id,
                Status = finalStatus,
                CompletedOn = _clock.UtcNow,
                CompletedBy = request.CallerId,
                OutcomeSummary = request.Comment
            });
        }

        private void Cancel(ParentRecord parent, ParentActionRequest request)
        {
            if (!ParentStatusRules.IsActive(parent.Status))
            {
                throw new LifecycleException(LifecycleErrorCodes.CancelTerminal, "This referral is already closed and cannot be cancelled.");
            }

            ActionInputRules.ValidateParentInput(ParentAction.Cancel, request.Comment);

            // Open items are cancelled; items that already have an outcome stay as evidence.
            IList<ItemRecord> items = _repository.GetCurrentItems(parent.Id);
            foreach (ItemRecord item in items.Where(i => ItemStatusRules.IsOpen(i.Status)).OrderBy(i => i.Id))
            {
                _repository.UpdateItem(new ItemUpdate { Id = item.Id, ExpectedRowVersion = item.RowVersion, Status = ItemStatus.Cancelled });
            }

            List<ItemStatus> finalStatuses = items
                .Select(i => ItemStatusRules.IsOpen(i.Status) ? ItemStatus.Cancelled : i.Status)
                .ToList();
            ParentOutcome counts = ParentAggregator.Calculate(finalStatuses, parent.HasEverBeenSubmitted, true);

            DateTime now = _clock.UtcNow;
            _repository.UpdateParent(new ParentUpdate
            {
                Id = parent.Id,
                Status = ParentStatus.Cancelled,
                Counts = counts,
                ExplicitlyCancelled = true,
                CancellationReason = request.Comment,
                CompletedOn = now,
                CompletedBy = request.CallerId,
                LastAggregatedOn = now
            });
        }

        private static void RequireParentStatus(ParentRecord parent, ParentStatus required, string what)
        {
            if (parent.Status != required)
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.StatusConflict,
                    "The referral is '" + parent.Status + "', so it cannot be " + what + ". Refresh the record and try again.");
            }
        }
    }
}
