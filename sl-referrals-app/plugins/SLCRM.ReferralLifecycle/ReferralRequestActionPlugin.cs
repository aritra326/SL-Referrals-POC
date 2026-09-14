using System;
using Microsoft.Xrm.Sdk;

namespace SLCRM.ReferralLifecycle
{
    /// <summary>
    /// Main-operation plug-in for the Custom API "slcrm_ExecuteReferralRequestAction".
    /// Register step: Message = slcrm_ExecuteReferralRequestAction, Primary Entity = slcrm_referralrequest,
    /// Stage = Main Operation (30), Mode = Synchronous.
    /// </summary>
    public class ReferralRequestActionPlugin : IPlugin
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
                    throw new InvalidPluginExecutionException("SLCRM-VAL-TARGET: Target is required and must reference a Referral Request.");

                if (target.LogicalName != ReferralLifecycleService.RequestEntity)
                    throw new InvalidPluginExecutionException($"SLCRM-VAL-TARGET-ENTITY: This API applies only to {ReferralLifecycleService.RequestEntity}.");

                var actionName = context.InputParameters.Contains("ActionName") ? context.InputParameters["ActionName"] as string : null;
                if (string.IsNullOrWhiteSpace(actionName))
                    throw new InvalidPluginExecutionException("SLCRM-VAL-ACTIONNAME: ActionName is required.");

                var comment = context.InputParameters.Contains("Comment") ? context.InputParameters["Comment"] as string : null;

                var lifecycle = new ReferralLifecycleService(service, tracing);
                var resultId = lifecycle.ExecuteRequestAction(target.Id, actionName, comment, context.UserId);

                context.OutputParameters["ResultRecordId"] = resultId;
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                tracing.Trace($"ReferralRequestActionPlugin unhandled error: {ex}");
                throw new InvalidPluginExecutionException("The referral request action could not be completed.", ex);
            }
        }
    }
}
