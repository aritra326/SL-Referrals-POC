using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SLCRM.ReferralLifecycle
{
    /// <summary>
    /// Shared server-side logic for the referral lifecycle Custom APIs
    /// (slcrm_ExecuteReferralItemAction, slcrm_ExecuteReferralRequestAction).
    ///
    /// Status reasons are resolved BY LABEL at runtime (never hardcoded option values) because
    /// option-set integers are assigned per environment/publisher and are not portable.
    ///
    /// NOT YET IMPLEMENTED (left for the next pass, per the POC's staged build-out):
    ///  - EligibilityService: live authority/rank/product validation before Onward/Authorise.
    ///  - OutboxService: slcrm_referralnotification row creation for downstream Power Automate delivery.
    ///  - Optimistic-concurrency row-version checks (ExpectedRowVersion) — the deployed Custom API
    ///    contract does not currently carry one; add it if/when the JS caller starts sending it.
    /// </summary>
    public class ReferralLifecycleService
    {
        public const string ItemEntity = "slcrm_referralitem";
        public const string RequestEntity = "slcrm_referralrequest";
        public const string DecisionEntity = "slcrm_referraldecision";

        private readonly IOrganizationService _service;
        private readonly ITracingService _tracing;
        private readonly Dictionary<string, Dictionary<string, int>> _statusReasonCache =
            new Dictionary<string, Dictionary<string, int>>(StringComparer.OrdinalIgnoreCase);

        public ReferralLifecycleService(IOrganizationService service, ITracingService tracing)
        {
            _service = service;
            _tracing = tracing;
        }

        // ---------------------------------------------------------------
        // Status reason resolution (by label — see class remarks)
        // ---------------------------------------------------------------

        /// <summary>Resolves a status reason label to its (statuscode, statecode) pair for an entity.</summary>
        public OptionSetValue ResolveStatusReason(string entityLogicalName, string label, out int stateCode)
        {
            var map = GetStatusReasonMap(entityLogicalName);
            if (!map.TryGetValue(label, out var statusCodeValue))
            {
                throw new InvalidPluginExecutionException(
                    $"SLCRM-LIFECYCLE-404: Status reason '{label}' is not defined on {entityLogicalName}.");
            }

            // State is derived from the metadata's own status-to-state mapping, fetched alongside.
            stateCode = GetStateForStatus(entityLogicalName, statusCodeValue);
            return new OptionSetValue(statusCodeValue);
        }

        private Dictionary<string, int> GetStatusReasonMap(string entityLogicalName)
        {
            if (_statusReasonCache.TryGetValue(entityLogicalName, out var cached)) return cached;

            var req = new Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest
            {
                EntityLogicalName = entityLogicalName,
                LogicalName = "statuscode",
                RetrieveAsIfPublished = true
            };
            var resp = (Microsoft.Xrm.Sdk.Messages.RetrieveAttributeResponse)_service.Execute(req);
            var meta = (Microsoft.Xrm.Sdk.Metadata.StatusAttributeMetadata)resp.AttributeMetadata;

            var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var opt in meta.OptionSet.Options)
            {
                var label = opt.Label?.UserLocalizedLabel?.Label;
                if (!string.IsNullOrEmpty(label) && opt.Value.HasValue)
                {
                    map[label] = opt.Value.Value;
                }
            }
            _statusReasonCache[entityLogicalName] = map;
            return map;
        }

        private readonly Dictionary<string, Dictionary<int, int>> _stateForStatusCache =
            new Dictionary<string, Dictionary<int, int>>();

        private int GetStateForStatus(string entityLogicalName, int statusCodeValue)
        {
            if (!_stateForStatusCache.TryGetValue(entityLogicalName, out var map))
            {
                var req = new Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest
                {
                    EntityLogicalName = entityLogicalName,
                    LogicalName = "statuscode",
                    RetrieveAsIfPublished = true
                };
                var resp = (Microsoft.Xrm.Sdk.Messages.RetrieveAttributeResponse)_service.Execute(req);
                var meta = (Microsoft.Xrm.Sdk.Metadata.StatusAttributeMetadata)resp.AttributeMetadata;
                map = meta.OptionSet.Options
                    .Cast<Microsoft.Xrm.Sdk.Metadata.StatusOptionMetadata>()
                    .Where(o => o.Value.HasValue)
                    .ToDictionary(o => o.Value.Value, o => o.State ?? 0);
                _stateForStatusCache[entityLogicalName] = map;
            }
            return map.TryGetValue(statusCodeValue, out var state) ? state : 0;
        }

        private void SetStatus(Entity target, string entityLogicalName, string statusLabel)
        {
            var status = ResolveStatusReason(entityLogicalName, statusLabel, out var stateCode);
            target["statuscode"] = status;
            target["statecode"] = new OptionSetValue(stateCode);
        }

        // ---------------------------------------------------------------
        // Referral Item actions (slcrm_ExecuteReferralItemAction)
        // ---------------------------------------------------------------

        public Guid ExecuteItemAction(Guid itemId, string actionName, string comment, Guid? newAuthorityId, Guid callerId)
        {
            _tracing.Trace($"ExecuteItemAction: item={itemId} action={actionName}");

            var item = _service.Retrieve(ItemEntity, itemId, new ColumnSet(
                "slcrm_referral", "slcrm_assignedapprover", "slcrm_iscurrentrevision",
                "slcrm_revisionnumber", "slcrm_logicalitemid", "statuscode"));

            var parentId = ((EntityReference)item["slcrm_referral"]).Id;
            Guid resultId = itemId;

            switch (actionName)
            {
                case "StartReview":
                    {
                        var upd = new Entity(ItemEntity, itemId);
                        SetStatus(upd, ItemEntity, "In Review");
                        upd["slcrm_reviewstartedon"] = DateTime.UtcNow;
                        _service.Update(upd);
                        break;
                    }

                case "RequestInformation":
                    {
                        CreateDecision(itemId, parentId, "More Information Required", comment, null, null, null, callerId);
                        var upd = new Entity(ItemEntity, itemId);
                        SetStatus(upd, ItemEntity, "More Information Required");
                        upd["slcrm_informationresponse"] = null;
                        _service.Update(upd);
                        break;
                    }

                case "Resubmit":
                    {
                        var upd = new Entity(ItemEntity, itemId);
                        SetStatus(upd, ItemEntity, "Resubmitted");
                        upd["slcrm_respondedon"] = DateTime.UtcNow;
                        _service.Update(upd);
                        break;
                    }

                case "Onward":
                    {
                        // TODO(eligibility): validate newAuthorityId is a strictly-higher eligible
                        // Underwriting Authority for this item's product before accepting the onward route.
                        if (!newAuthorityId.HasValue)
                            throw new InvalidPluginExecutionException("SLCRM-VAL-ONWARD-AUTHORITY: An onward authority must be selected.");
                        CreateDecision(itemId, parentId, "Onward", comment, null, null, newAuthorityId, callerId);
                        var upd = new Entity(ItemEntity, itemId);
                        SetStatus(upd, ItemEntity, "Onward for Approval");
                        upd["slcrm_underwriterauthority"] = new EntityReference("slcrm_underwriterauthority", newAuthorityId.Value);
                        _service.Update(upd);
                        break;
                    }

                case "Authorise":
                    {
                        CreateDecision(itemId, parentId, "Authorised", comment, null, null, null, callerId);
                        var upd = new Entity(ItemEntity, itemId);
                        SetStatus(upd, ItemEntity, "Authorised");
                        _service.Update(upd);
                        break;
                    }

                case "AuthoriseWithRecommendations":
                    {
                        CreateDecision(itemId, parentId, "Authorised with Recommendations", comment, comment, null, null, callerId);
                        var upd = new Entity(ItemEntity, itemId);
                        SetStatus(upd, ItemEntity, "Authorised with Recommendations");
                        _service.Update(upd);
                        break;
                    }

                case "AuthoriseWithConditions":
                    {
                        CreateDecision(itemId, parentId, "Authorised with Conditions", comment, null, comment, null, callerId);
                        var upd = new Entity(ItemEntity, itemId);
                        SetStatus(upd, ItemEntity, "Authorised with Conditions");
                        _service.Update(upd);
                        break;
                    }

                case "Reject":
                    {
                        CreateDecision(itemId, parentId, "Rejected", comment, null, null, null, callerId);
                        var upd = new Entity(ItemEntity, itemId);
                        SetStatus(upd, ItemEntity, "Rejected");
                        _service.Update(upd);
                        break;
                    }

                case "CreateRevision":
                    {
                        resultId = CreateRevision(item, itemId);
                        break;
                    }

                case "Cancel":
                    {
                        var upd = new Entity(ItemEntity, itemId);
                        SetStatus(upd, ItemEntity, "Cancelled / No Longer Required");
                        _service.Update(upd);
                        break;
                    }

                default:
                    throw new InvalidPluginExecutionException($"SLCRM-VAL-UNKNOWNACTION: Unknown Referral Item action '{actionName}'.");
            }

            RecalculateParentStatus(parentId);
            return resultId;
        }

        private Guid CreateRevision(Entity oldItem, Guid oldItemId)
        {
            // Mark the rejected/current item as superseded and no longer current.
            var closeOld = new Entity(ItemEntity, oldItemId);
            closeOld["slcrm_iscurrentrevision"] = false;
            closeOld["slcrm_supersededon"] = DateTime.UtcNow;
            _service.Update(closeOld);

            var full = _service.Retrieve(ItemEntity, oldItemId, new ColumnSet(true));
            var revisionNumber = full.Contains("slcrm_revisionnumber") ? full.GetAttributeValue<int>("slcrm_revisionnumber") : 0;
            var rootRef = full.Contains("slcrm_rootreferralitem")
                ? full.GetAttributeValue<EntityReference>("slcrm_rootreferralitem")
                : new EntityReference(ItemEntity, oldItemId);

            var revision = new Entity(ItemEntity);
            // Copy the business/reason context forward; snapshot/decision fields intentionally reset.
            string[] carryForward =
            {
                "slcrm_referral", "slcrm_product", "slcrm_coversection", "slcrm_referralreason",
                "slcrm_itemsummary", "slcrm_referraldetails", "slcrm_underwriterrationale",
                "slcrm_requesteddecisionexception", "slcrm_requiredauthoritylevel",
                "slcrm_proposedduration", "slcrm_maxduration", "slcrm_requestedgeography",
                "slcrm_geographyexception", "slcrm_requestedlimit", "slcrm_currentauthoritylimit",
                "slcrm_proposedpremium", "slcrm_technicalpremium", "slcrm_pricingrationale",
                "slcrm_reinsurancetype", "slcrm_retentionamount", "slcrm_placementdetail",
                "slcrm_wordingtitle", "slcrm_currentwording", "slcrm_requestedwording"
            };
            foreach (var attr in carryForward)
            {
                if (full.Contains(attr)) revision[attr] = full[attr];
            }

            revision["slcrm_logicalitemid"] = full.GetAttributeValue<string>("slcrm_logicalitemid");
            revision["slcrm_revisionnumber"] = revisionNumber + 1;
            revision["slcrm_iscurrentrevision"] = true;
            revision["slcrm_previousreferralitem"] = new EntityReference(ItemEntity, oldItemId);
            revision["slcrm_rootreferralitem"] = rootRef;
            SetStatus(revision, ItemEntity, "Revision in Progress");

            return _service.Create(revision);
        }

        private void CreateDecision(Guid itemId, Guid parentId, string decisionTypeLabel, string comment,
            string recommendations, string conditions, Guid? onwardAuthorityId, Guid callerId)
        {
            var decision = new Entity(DecisionEntity);
            decision["slcrm_referralitem"] = new EntityReference(ItemEntity, itemId);
            decision["slcrm_referral"] = new EntityReference(RequestEntity, parentId);
            decision["slcrm_decisionby"] = new EntityReference("systemuser", callerId);
            decision["slcrm_decisionon"] = DateTime.UtcNow;
            decision["slcrm_decisioncomments"] = comment;
            if (!string.IsNullOrEmpty(recommendations)) decision["slcrm_recommendations"] = recommendations;
            if (!string.IsNullOrEmpty(conditions)) decision["slcrm_conditions"] = conditions;
            if (onwardAuthorityId.HasValue)
                decision["slcrm_onwardauthorityassignment"] = new EntityReference("slcrm_underwriterauthority", onwardAuthorityId.Value);

            var decisionTypeMap = GetPicklistMap(DecisionEntity, "slcrm_decisiontype");
            if (decisionTypeMap.TryGetValue(decisionTypeLabel, out var dtValue))
            {
                decision["slcrm_decisiontype"] = new OptionSetValue(dtValue);
            }

            SetStatus(decision, DecisionEntity, "Recorded");
            _service.Create(decision);
        }

        private readonly Dictionary<string, Dictionary<string, int>> _picklistCache =
            new Dictionary<string, Dictionary<string, int>>();

        private Dictionary<string, int> GetPicklistMap(string entityLogicalName, string attributeLogicalName)
        {
            var key = entityLogicalName + "." + attributeLogicalName;
            if (_picklistCache.TryGetValue(key, out var cached)) return cached;

            var req = new Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest
            {
                EntityLogicalName = entityLogicalName,
                LogicalName = attributeLogicalName,
                RetrieveAsIfPublished = true
            };
            var resp = (Microsoft.Xrm.Sdk.Messages.RetrieveAttributeResponse)_service.Execute(req);
            var meta = (Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata)resp.AttributeMetadata;
            var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var opt in meta.OptionSet.Options)
            {
                var label = opt.Label?.UserLocalizedLabel?.Label;
                if (!string.IsNullOrEmpty(label) && opt.Value.HasValue) map[label] = opt.Value.Value;
            }
            _picklistCache[key] = map;
            return map;
        }

        // ---------------------------------------------------------------
        // Referral Request actions (slcrm_ExecuteReferralRequestAction)
        // ---------------------------------------------------------------

        public Guid ExecuteRequestAction(Guid requestId, string actionName, string comment, Guid callerId)
        {
            _tracing.Trace($"ExecuteRequestAction: request={requestId} action={actionName}");

            switch (actionName)
            {
                case "Submit":
                    {
                        var drafts = QueryCurrentItems(requestId, "Draft");
                        foreach (var item in drafts)
                        {
                            var upd = new Entity(ItemEntity, item.Id);
                            SetStatus(upd, ItemEntity, "Sent for Approval");
                            upd["slcrm_submittedon"] = DateTime.UtcNow;
                            upd["slcrm_submittedby"] = new EntityReference("systemuser", callerId);
                            _service.Update(upd);
                        }

                        var upd2 = new Entity(RequestEntity, requestId);
                        var req = _service.Retrieve(RequestEntity, requestId, new ColumnSet("slcrm_haseverbeensubmitted"));
                        if (!req.GetAttributeValue<bool>("slcrm_haseverbeensubmitted"))
                        {
                            upd2["slcrm_haseverbeensubmitted"] = true;
                            upd2["slcrm_submittedon"] = DateTime.UtcNow;
                            upd2["slcrm_submittedby"] = new EntityReference("systemuser", callerId);
                        }
                        upd2["slcrm_lastsubmittedon"] = DateTime.UtcNow;
                        _service.Update(upd2);
                        break;
                    }

                case "SubmitRevisions":
                    {
                        var revisions = QueryCurrentItems(requestId, "Revision in Progress");
                        foreach (var item in revisions)
                        {
                            var upd = new Entity(ItemEntity, item.Id);
                            SetStatus(upd, ItemEntity, "Resubmitted");
                            _service.Update(upd);
                        }
                        var upd2 = new Entity(RequestEntity, requestId);
                        upd2["slcrm_lastsubmittedon"] = DateTime.UtcNow;
                        _service.Update(upd2);
                        break;
                    }

                case "CompletePartial":
                    {
                        var upd = new Entity(RequestEntity, requestId);
                        SetStatus(upd, RequestEntity, "Partially Authorised - Completed");
                        upd["slcrm_completedon"] = DateTime.UtcNow;
                        upd["slcrm_completedby"] = new EntityReference("systemuser", callerId);
                        upd["slcrm_outcomesummary"] = comment;
                        _service.Update(upd);
                        return requestId;
                    }

                case "CompleteRejected":
                    {
                        var upd = new Entity(RequestEntity, requestId);
                        SetStatus(upd, RequestEntity, "Rejected");
                        upd["slcrm_completedon"] = DateTime.UtcNow;
                        upd["slcrm_completedby"] = new EntityReference("systemuser", callerId);
                        upd["slcrm_outcomesummary"] = comment;
                        _service.Update(upd);
                        return requestId;
                    }

                case "Cancel":
                    {
                        var upd = new Entity(RequestEntity, requestId);
                        SetStatus(upd, RequestEntity, "Cancelled / No Longer Required");
                        upd["slcrm_explicitlycancelled"] = true;
                        upd["slcrm_cancellationreason"] = comment;
                        upd["slcrm_completedon"] = DateTime.UtcNow;
                        upd["slcrm_completedby"] = new EntityReference("systemuser", callerId);
                        _service.Update(upd);
                        return requestId;
                    }

                default:
                    throw new InvalidPluginExecutionException($"SLCRM-VAL-UNKNOWNACTION: Unknown Referral Request action '{actionName}'.");
            }

            RecalculateParentStatus(requestId);
            return requestId;
        }

        private List<Entity> QueryCurrentItems(Guid requestId, string statusLabel)
        {
            var map = GetStatusReasonMap(ItemEntity);
            var query = new QueryExpression(ItemEntity)
            {
                ColumnSet = new ColumnSet("statuscode", "slcrm_iscurrentrevision")
            };
            query.Criteria.AddCondition("slcrm_referral", ConditionOperator.Equal, requestId);
            query.Criteria.AddCondition("slcrm_iscurrentrevision", ConditionOperator.Equal, true);
            if (map.TryGetValue(statusLabel, out var statusValue))
            {
                query.Criteria.AddCondition("statuscode", ConditionOperator.Equal, statusValue);
            }
            return _service.RetrieveMultiple(query).Entities.ToList();
        }

        // ---------------------------------------------------------------
        // Parent aggregation — implements the spec's section 11.6/11.7 truth table.
        // ---------------------------------------------------------------

        public void RecalculateParentStatus(Guid parentId)
        {
            var request = _service.Retrieve(RequestEntity, parentId, new ColumnSet(
                "slcrm_explicitlycancelled", "slcrm_haseverbeensubmitted"));

            if (request.GetAttributeValue<bool>("slcrm_explicitlycancelled"))
            {
                _tracing.Trace("RecalculateParentStatus: parent explicitly cancelled — leaving as-is.");
                UpdateCounts(parentId, 0, 0, 0, 0, 0);
                return;
            }

            var itemMap = GetStatusReasonMap(ItemEntity);
            var labelByValue = itemMap.ToDictionary(kv => kv.Value, kv => kv.Key);

            var query = new QueryExpression(ItemEntity) { ColumnSet = new ColumnSet("statuscode") };
            query.Criteria.AddCondition("slcrm_referral", ConditionOperator.Equal, parentId);
            query.Criteria.AddCondition("slcrm_iscurrentrevision", ConditionOperator.Equal, true);
            var items = _service.RetrieveMultiple(query).Entities;

            var statuses = items
                .Select(i => i.GetAttributeValue<OptionSetValue>("statuscode"))
                .Where(v => v != null)
                .Select(v => labelByValue.TryGetValue(v.Value, out var l) ? l : null)
                .Where(l => l != null)
                .ToList();

            var authorisedFamily = new HashSet<string> { "Authorised", "Authorised with Recommendations", "Authorised with Conditions" };
            var openStatuses = new HashSet<string> { "Draft", "Sent for Approval", "In Review", "More Information Required", "Revision in Progress", "Resubmitted", "Onward for Approval" };

            var totalCount = statuses.Count;
            var openCount = statuses.Count(s => openStatuses.Contains(s));
            var authorisedCount = statuses.Count(s => authorisedFamily.Contains(s));
            var rejectedCount = statuses.Count(s => s == "Rejected");
            var cancelledCount = statuses.Count(s => s == "Cancelled / No Longer Required");

            UpdateCounts(parentId, totalCount, openCount, authorisedCount, rejectedCount, cancelledCount);

            string newStatusLabel;
            var hasEverBeenSubmitted = request.GetAttributeValue<bool>("slcrm_haseverbeensubmitted");

            if (statuses.Count == 0 || !hasEverBeenSubmitted || statuses.All(s => s == "Draft"))
            {
                newStatusLabel = "Draft";
            }
            else if (statuses.Any(s => s == "More Information Required"))
            {
                newStatusLabel = "More Information Required";
            }
            else if (statuses.Any(s => s == "Revision in Progress"))
            {
                newStatusLabel = "Revision in Progress";
            }
            else if (statuses.Any(s => openStatuses.Contains(s) && s != "Onward for Approval"))
            {
                newStatusLabel = "Sent for Approval";
            }
            else if (statuses.Any(s => s == "Onward for Approval") &&
                     statuses.Where(s => openStatuses.Contains(s)).All(s => s == "Onward for Approval"))
            {
                newStatusLabel = "Onward for Approval";
            }
            else
            {
                var terminalNonCancelled = statuses.Where(s => s != "Cancelled / No Longer Required").ToList();
                if (terminalNonCancelled.Count == 0)
                {
                    // SLR-AGG-ALLCANCELLED: every current item is cancelled — leave the parent's
                    // existing status; a human decision (explicit Cancel) is required to close it.
                    _tracing.Trace("RecalculateParentStatus: all current items cancelled — no automatic transition.");
                    return;
                }
                else if (terminalNonCancelled.Any(s => authorisedFamily.Contains(s)) && terminalNonCancelled.Any(s => s == "Rejected"))
                {
                    newStatusLabel = "Partially Authorised - Underwriter Action Required";
                }
                else if (terminalNonCancelled.All(s => s == "Rejected"))
                {
                    newStatusLabel = "Rejected - Underwriter Action Required";
                }
                else if (terminalNonCancelled.All(s => authorisedFamily.Contains(s)))
                {
                    if (terminalNonCancelled.Any(s => s == "Authorised with Conditions")) newStatusLabel = "Authorised with Conditions";
                    else if (terminalNonCancelled.Any(s => s == "Authorised with Recommendations")) newStatusLabel = "Authorised with Recommendations";
                    else newStatusLabel = "Authorised";
                }
                else
                {
                    _tracing.Trace("RecalculateParentStatus: unsupported combination — leaving parent status unchanged.");
                    return;
                }
            }

            var upd = new Entity(RequestEntity, parentId);
            SetStatus(upd, RequestEntity, newStatusLabel);
            upd["slcrm_lastaggregatedon"] = DateTime.UtcNow;
            _service.Update(upd);
        }

        private void UpdateCounts(Guid parentId, int total, int open, int authorised, int rejected, int cancelled)
        {
            var upd = new Entity(RequestEntity, parentId);
            upd["slcrm_openitemcount"] = open;
            upd["slcrm_authorisedcurrentitemcount"] = authorised;
            upd["slcrm_rejectedcurrentitemcount"] = rejected;
            upd["slcrm_cancelledcurrentitemcount"] = cancelled;
            _service.Update(upd);
        }
    }
}
