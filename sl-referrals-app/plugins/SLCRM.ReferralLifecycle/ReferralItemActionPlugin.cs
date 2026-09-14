using System;
using Microsoft.Xrm.Sdk;

namespace SLCRM.ReferralLifecycle
{
    /// <summary>
    /// Main-operation plug-in for the Custom API "slcrm_ExecuteReferralItemAction".
    /// Register step: Message = slcrm_ExecuteReferralItemAction, Primary Entity = slcrm_referralitem,
    /// Stage = Main Operation (30), Mode = Synchronous.
    /// </summary>
    public class ReferralItemActionPlugin : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);

            try
            {
                if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is EntityReference target))
                    throw new InvalidPluginExecutionException("SLCRM-VAL-TARGET: Target is required and must reference a Referral Item.");

                if (target.LogicalName != ReferralLifecycleService.ItemEntity)
                    throw new InvalidPluginExecutionException($"SLCRM-VAL-TARGET-ENTITY: This API applies only to {ReferralLifecycleService.ItemEntity}.");

                var actionName = context.InputParameters.Contains("ActionName") ? context.InputParameters["ActionName"] as string : null;
                if (string.IsNullOrWhiteSpace(actionName))
                    throw new InvalidPluginExecutionException("SLCRM-VAL-ACTIONNAME: ActionName is required.");

                var comment = context.InputParameters.Contains("Comment") ? context.InputParameters["Comment"] as string : null;
                Guid? newAuthorityId = null;
                if (context.InputParameters.Contains("NewAuthorityId") && context.InputParameters["NewAuthorityId"] is Guid guid && guid != Guid.Empty)
                {
                    newAuthorityId = guid;
                }

                var lifecycle = new ReferralLifecycleService(service, tracing);
                var resultId = lifecycle.ExecuteItemAction(target.Id, actionName, comment, newAuthorityId, context.UserId);

                context.OutputParameters["ResultRecordId"] = resultId;
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                tracing.Trace($"ReferralItemActionPlugin unhandled error: {ex}");
                throw new InvalidPluginExecutionException("The referral item action could not be completed.", ex);
            }
        }
    }
}
