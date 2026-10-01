using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Referral.Application;
using Referral.Domain;

namespace Referral.Dataverse
{
    /// <summary>
    /// Reads the lifecycle settings from Dataverse environment variables (no URLs, ids or secrets in code).
    /// A value set in the environment overrides the variable's default value.
    /// </summary>
    public class EnvironmentVariableSettings : ILifecycleSettingsProvider
    {
        private readonly IOrganizationService _service;
        private LifecycleSettings _loaded;

        public EnvironmentVariableSettings(IOrganizationService service)
        {
            _service = service;
        }

        public LifecycleSettings Load()
        {
            if (_loaded == null)
            {
                _loaded = ReadSettings();
            }

            return _loaded;
        }

        private LifecycleSettings ReadSettings()
        {
            Dictionary<string, string> values = ReadValues(
                Schema.Setting.RankDirection,
                Schema.Setting.EnableConditionalDecision,
                Schema.Setting.EnablePartialCompletion);

            var settings = new LifecycleSettings
            {
                EnableConditionalDecision = IsTrue(GetValue(values, Schema.Setting.EnableConditionalDecision)),
                EnablePartialCompletion = IsTrue(GetValue(values, Schema.Setting.EnablePartialCompletion))
            };

            string rank = GetValue(values, Schema.Setting.RankDirection);
            if (!string.IsNullOrWhiteSpace(rank))
            {
                settings.RankDirection = RankRules.Parse(rank);
            }

            return settings;
        }

        /// <summary>Returns schema name -> effective value (current value if set, otherwise the default).</summary>
        private Dictionary<string, string> ReadValues(params string[] schemaNames)
        {
            var definitionQuery = new QueryExpression("environmentvariabledefinition")
            {
                ColumnSet = new ColumnSet("schemaname", "defaultvalue")
            };
            definitionQuery.Criteria.AddCondition("schemaname", ConditionOperator.In, schemaNames.Cast<object>().ToArray());
            List<Entity> definitions = _service.RetrieveMultiple(definitionQuery).Entities.ToList();

            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (Entity definition in definitions)
            {
                result[definition.GetAttributeValue<string>("schemaname")] = definition.GetAttributeValue<string>("defaultvalue");
            }

            if (definitions.Count == 0)
            {
                return result;
            }

            var valueQuery = new QueryExpression("environmentvariablevalue")
            {
                ColumnSet = new ColumnSet("environmentvariabledefinitionid", "value")
            };
            valueQuery.Criteria.AddCondition(
                "environmentvariabledefinitionid",
                ConditionOperator.In,
                definitions.Select(d => (object)d.Id).ToArray());

            foreach (Entity current in _service.RetrieveMultiple(valueQuery).Entities)
            {
                Guid definitionId = current.GetAttributeValue<EntityReference>("environmentvariabledefinitionid").Id;
                Entity definition = definitions.First(d => d.Id == definitionId);
                result[definition.GetAttributeValue<string>("schemaname")] = current.GetAttributeValue<string>("value");
            }

            return result;
        }

        private static string GetValue(Dictionary<string, string> values, string schemaName)
        {
            string value;
            return values.TryGetValue(schemaName, out value) ? value : null;
        }

        private static bool IsTrue(string value)
        {
            return string.Equals(value, "true", StringComparison.OrdinalIgnoreCase)
                || string.Equals(value, "yes", StringComparison.OrdinalIgnoreCase)
                || value == "1";
        }
    }
}
