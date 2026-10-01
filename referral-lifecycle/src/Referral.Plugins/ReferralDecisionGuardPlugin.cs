using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Referral.Dataverse;
using Referral.Domain;

namespace Referral.Plugins
{
    /// <summary>
    /// Keeps Referral Decision rows immutable. Registered as two Pre-Operation steps on slcrm_referraldecision:
    /// Update (filtering attributes = the protected evidence columns) and Delete. See docs/plugin-registration.md.
    /// Creation is never blocked: decisions are created only by the lifecycle Custom API.
    /// The rule itself lives in <see cref="DecisionImmutability"/>; this class only reads the context.
    /// </summary>
    public class ReferralDecisionGuardPlugin : IPlugin
    {
        public const int PreOperationStage = 20;

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));

            if (!string.Equals(context.PrimaryEntityName, Schema.Decision.Table, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidPluginExecutionException("The decision guard is registered on the wrong table ('" + context.PrimaryEntityName + "').");
            }

            bool isDelete = string.Equals(context.MessageName, "Delete", StringComparison.OrdinalIgnoreCase);
            bool isUpdate = string.Equals(context.MessageName, "Update", StringComparison.OrdinalIgnoreCase);
            if (!isDelete && !isUpdate)
            {
                throw new InvalidPluginExecutionException("The decision guard only handles Update and Delete, not '" + context.MessageName + "'.");
            }

            if (context.Stage != PreOperationStage)
            {
                throw new InvalidPluginExecutionException("The decision guard must be registered in the Pre-Operation stage (20), not stage " + context.Stage + ".");
            }

            try
            {
                string[] changed = isUpdate ? ReadChangedColumns(context) : new string[0];
                bool maintenance = ReadMaintenanceSetting(factory);

                DecisionImmutability.Require(isDelete, changed, Schema.Decision.Protected, maintenance);
            }
            catch (LifecycleException ex)
            {
                tracing.Trace("Decision change refused: " + ex.Code + " message=" + context.MessageName + " user=" + context.InitiatingUserId);
                throw new InvalidPluginExecutionException(ex.Message);
            }
        }

        private static string[] ReadChangedColumns(IPluginExecutionContext context)
        {
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            return target == null ? new string[0] : target.Attributes.Keys.ToArray();
        }

        /// <summary>The maintenance exception is read with the system user so a caller cannot influence it.</summary>
        private static bool ReadMaintenanceSetting(IOrganizationServiceFactory factory)
        {
            IOrganizationService service = factory.CreateOrganizationService(null);
            return new EnvironmentVariableSettings(service).Load().AllowDecisionMaintenance;
        }
    }
}
