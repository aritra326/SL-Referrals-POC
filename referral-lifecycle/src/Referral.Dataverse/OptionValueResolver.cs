using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Referral.Domain;

namespace Referral.Dataverse
{
    /// <summary>One option of a status or choice column, as read from metadata.</summary>
    public class OptionInfo
    {
        public int Value { get; set; }
        public string Label { get; set; }

        /// <summary>The Dataverse state (0 = Active, 1 = Inactive). Only set for status reason options.</summary>
        public int? State { get; set; }
    }

    /// <summary>
    /// Finds Dataverse option values by label. Option values are assigned per environment, so the code
    /// names the label (see <see cref="OptionLabels"/>) and this class returns the number that environment uses.
    /// Metadata is read at most once per column for the life of the instance (one plug-in execution).
    /// </summary>
    public class OptionValueResolver
    {
        private const int BaseLanguage = 1033;

        private readonly IOrganizationService _service;
        private readonly Dictionary<string, IList<OptionInfo>> _cache = new Dictionary<string, IList<OptionInfo>>();

        public OptionValueResolver(IOrganizationService service)
        {
            _service = service;
        }

        // ---- business status -> Dataverse option ---------------------------------------------------

        public OptionInfo ForItemStatus(ItemStatus status)
        {
            return FindByLabel(Schema.Item.Table, Schema.StatusCode, OptionLabels.ItemStatus[status]);
        }

        public OptionInfo ForParentStatus(ParentStatus status)
        {
            return FindByLabel(Schema.Parent.Table, Schema.StatusCode, OptionLabels.ParentStatus[status]);
        }

        public OptionInfo ForDecisionType(DecisionType type)
        {
            return FindByLabel(Schema.Decision.Table, Schema.Decision.DecisionType, OptionLabels.DecisionType[type]);
        }

        // ---- Dataverse option -> business status ---------------------------------------------------

        public ItemStatus ToItemStatus(int optionValue)
        {
            return ReverseLookup(Schema.Item.Table, optionValue, OptionLabels.ItemStatus, "item");
        }

        public ParentStatus ToParentStatus(int optionValue)
        {
            return ReverseLookup(Schema.Parent.Table, optionValue, OptionLabels.ParentStatus, "referral");
        }

        /// <summary>True when the authority row's status reason is the "Current" one.</summary>
        public bool IsCurrentAuthorityStatus(int optionValue)
        {
            OptionInfo option = GetOptions(Schema.Authority.Table, Schema.StatusCode).FirstOrDefault(o => o.Value == optionValue);
            return option != null && SameLabel(option.Label, OptionLabels.AuthorityStatusCurrent);
        }

        // ---- internals ------------------------------------------------------------------------------

        private T ReverseLookup<T>(string table, int optionValue, IDictionary<T, string> labels, string what)
        {
            OptionInfo option = GetOptions(table, Schema.StatusCode).FirstOrDefault(o => o.Value == optionValue);
            if (option != null)
            {
                foreach (KeyValuePair<T, string> pair in labels)
                {
                    if (SameLabel(pair.Value, option.Label))
                    {
                        return pair.Key;
                    }
                }
            }

            throw new LifecycleException(
                LifecycleErrorCodes.StatusConflict,
                "The " + what + " has a status ('" + (option == null ? optionValue.ToString() : option.Label) + "') this version of the lifecycle code does not recognise.");
        }

        private OptionInfo FindByLabel(string table, string column, string label)
        {
            OptionInfo found = GetOptions(table, column).FirstOrDefault(o => SameLabel(o.Label, label));
            if (found == null)
            {
                throw new InvalidOperationException(
                    "The option '" + label + "' does not exist on " + table + "." + column + ". The environment's choice labels no longer match OptionLabels.cs.");
            }

            return found;
        }

        private IList<OptionInfo> GetOptions(string table, string column)
        {
            string key = table + "." + column;
            IList<OptionInfo> options;
            if (!_cache.TryGetValue(key, out options))
            {
                options = LoadOptions(table, column);
                _cache[key] = options;
            }

            return options;
        }

        private IList<OptionInfo> LoadOptions(string table, string column)
        {
            var request = new RetrieveAttributeRequest
            {
                EntityLogicalName = table,
                LogicalName = column,
                RetrieveAsIfPublished = true
            };
            var response = (RetrieveAttributeResponse)_service.Execute(request);

            var status = response.AttributeMetadata as StatusAttributeMetadata;
            if (status != null)
            {
                return status.OptionSet.Options.Select(o => ToInfo(o, ((StatusOptionMetadata)o).State)).ToList();
            }

            var picklist = response.AttributeMetadata as PicklistAttributeMetadata;
            if (picklist != null)
            {
                return picklist.OptionSet.Options.Select(o => ToInfo(o, null)).ToList();
            }

            throw new InvalidOperationException(table + "." + column + " is not a status or choice column.");
        }

        private static OptionInfo ToInfo(OptionMetadata option, int? state)
        {
            LocalizedLabel label = option.Label.LocalizedLabels.FirstOrDefault(l => l.LanguageCode == BaseLanguage)
                                   ?? option.Label.UserLocalizedLabel;

            return new OptionInfo
            {
                Value = option.Value.GetValueOrDefault(),
                Label = label == null ? string.Empty : label.Label,
                State = state
            };
        }

        private static bool SameLabel(string a, string b)
        {
            return string.Equals((a ?? string.Empty).Trim(), (b ?? string.Empty).Trim(), StringComparison.OrdinalIgnoreCase);
        }
    }
}
