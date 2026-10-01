using System;
using System.Collections.Generic;
using Referral.Application;
using Referral.Dataverse;

namespace Referral.Plugins
{
    /// <summary>
    /// Main-operation plug-in for the slcrm_ExecuteReferralItemAction Custom API (bound to slcrm_referralitem).
    /// Register it on that message only; see docs/plugin-registration.md.
    /// </summary>
    public class ReferralItemActionPlugin : LifecyclePluginBase
    {
        protected override string MessageName
        {
            get { return "slcrm_ExecuteReferralItemAction"; }
        }

        protected override string TargetTable
        {
            get { return Schema.Item.Table; }
        }

        protected override IDictionary<string, object> Run(PluginCall call, LifecycleServices services)
        {
            var service = new ItemActionService(services.Repository, services.Settings, services.Clock, services.Trace);

            return Result(service.Execute(new ItemActionRequest
            {
                ItemId = call.TargetId,
                ActionName = call.ActionName,
                Comment = call.Comment,
                NewAuthorityId = call.NewAuthorityId,
                CallerId = call.CallerId,
                CorrelationId = call.CorrelationId
            }));
        }
    }

    /// <summary>
    /// Main-operation plug-in for the slcrm_ExecuteReferralRequestAction Custom API (bound to slcrm_referralrequest).
    /// Register it on that message only; see docs/plugin-registration.md.
    /// </summary>
    public class ReferralRequestActionPlugin : LifecyclePluginBase
    {
        protected override string MessageName
        {
            get { return "slcrm_ExecuteReferralRequestAction"; }
        }

        protected override string TargetTable
        {
            get { return Schema.Parent.Table; }
        }

        protected override IDictionary<string, object> Run(PluginCall call, LifecycleServices services)
        {
            var service = new ParentActionService(services.Repository, services.Settings, services.Clock, services.Trace);

            return Result(service.Execute(new ParentActionRequest
            {
                ParentId = call.TargetId,
                ActionName = call.ActionName,
                Comment = call.Comment,
                CallerId = call.CallerId,
                CorrelationId = call.CorrelationId
            }));
        }
    }
}
