using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Referral.Application;
using Referral.Dataverse;
using Referral.Domain;

namespace Referral.Plugins
{
    /// <summary>What the Custom API caller sent, already read out of the plug-in context.</summary>
    public class PluginCall
    {
        public Guid TargetId { get; set; }
        public string ActionName { get; set; }
        public string Comment { get; set; }
        public Guid? NewAuthorityId { get; set; }
        public Guid CallerId { get; set; }
        public string CorrelationId { get; set; }
    }

    /// <summary>The objects the use cases need, built once per plug-in execution.</summary>
    public class LifecycleServices
    {
        public IReferralRepository Repository { get; set; }
        public ILifecycleSettingsProvider Settings { get; set; }
        public IClock Clock { get; set; }
        public ITrace Trace { get; set; }
    }

    /// <summary>Lets the use cases write to the Dataverse plug-in trace log.</summary>
    public class TracingServiceTrace : ITrace
    {
        private readonly ITracingService _tracing;

        public TracingServiceTrace(ITracingService tracing)
        {
            _tracing = tracing;
        }

        public void Write(string message)
        {
            _tracing.Trace(message);
        }
    }

    /// <summary>
    /// Shared entry-point behaviour for the two lifecycle Custom API plug-ins: check the step is registered
    /// correctly, read the inputs, call the use case, and turn business errors into user-friendly messages.
    /// Business rules live in Referral.Domain and Referral.Application, not here.
    /// </summary>
    public abstract class LifecyclePluginBase : IPlugin
    {
        /// <summary>Custom API steps run in the Main Operation stage.</summary>
        public const int MainOperationStage = 30;

        /// <summary>Our own writes never trigger these Custom APIs again, so a deep call chain means something is wrong.</summary>
        public const int MaxDepth = 3;

        public const string ResultOutputName = "ResultRecordId";

        /// <summary>The Custom API message this plug-in must be registered on.</summary>
        protected abstract string MessageName { get; }

        /// <summary>The table the Custom API is bound to.</summary>
        protected abstract string TargetTable { get; }

        /// <summary>Runs the use case and returns the id to send back as ResultRecordId.</summary>
        protected abstract Guid Run(PluginCall call, LifecycleServices services);

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var tracing = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));

            try
            {
                ValidateRegistration(context);
                PluginCall call = ReadCall(context);
                tracing.Trace("Start " + MessageName + " action=" + call.ActionName + " target=" + call.TargetId + " correlation=" + call.CorrelationId);

                // Writes run as the system user because the caller's own security roles are not meant to allow
                // writing decisions. Who the caller is, and what they may do, is checked in the use case instead.
                IOrganizationService service = factory.CreateOrganizationService(null);
                Guid resultId = Run(call, CreateServices(service, tracing));

                context.OutputParameters[ResultOutputName] = resultId;
            }
            catch (LifecycleException ex)
            {
                tracing.Trace("Business rule stopped the action: " + ex.Code);
                throw new InvalidPluginExecutionException(ex.Message);
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                tracing.Trace("Unexpected error: " + ex);
                throw new InvalidPluginExecutionException(
                    "The referral action could not be completed. Please try again, and quote reference " + context.CorrelationId + " if it keeps happening.");
            }
        }

        /// <summary>Builds the real Dataverse-backed services. Tests override this to supply fakes.</summary>
        protected virtual LifecycleServices CreateServices(IOrganizationService service, ITracingService tracing)
        {
            var options = new OptionValueResolver(service);
            return new LifecycleServices
            {
                Repository = new ReferralRepository(service, options),
                Settings = new EnvironmentVariableSettings(service),
                Clock = new SystemClock(),
                Trace = new TracingServiceTrace(tracing)
            };
        }

        private void ValidateRegistration(IPluginExecutionContext context)
        {
            if (!string.Equals(context.MessageName, MessageName, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidPluginExecutionException(
                    "This plug-in is registered on the wrong message ('" + context.MessageName + "'). It belongs on '" + MessageName + "'.");
            }

            if (context.Stage != MainOperationStage)
            {
                throw new InvalidPluginExecutionException(
                    "This plug-in must be registered in the Main Operation stage (30), not stage " + context.Stage + ".");
            }

            if (context.Depth > MaxDepth)
            {
                throw new InvalidPluginExecutionException("The referral action was called too many times in a row and has been stopped.");
            }
        }

        private PluginCall ReadCall(IPluginExecutionContext context)
        {
            EntityReference target = ReadInput<EntityReference>(context, "Target");
            if (target == null || !string.Equals(target.LogicalName, TargetTable, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidPluginExecutionException("The request did not include a " + TargetTable + " record to act on.");
            }

            string actionName = ReadInput<string>(context, "ActionName");
            if (string.IsNullOrWhiteSpace(actionName))
            {
                throw new InvalidPluginExecutionException("The request did not say which action to run (ActionName).");
            }

            return new PluginCall
            {
                TargetId = target.Id,
                ActionName = actionName,
                Comment = ReadInput<string>(context, "Comment"),
                NewAuthorityId = ReadGuidInput(context, "NewAuthorityId"),
                CallerId = context.InitiatingUserId,
                CorrelationId = context.CorrelationId.ToString()
            };
        }

        /// <summary>Custom API parameter names are matched ignoring case, because the deployed contract mixes "Id" and "ID".</summary>
        private static T ReadInput<T>(IPluginExecutionContext context, string name) where T : class
        {
            string key = context.InputParameters.Keys.FirstOrDefault(k => string.Equals(k, name, StringComparison.OrdinalIgnoreCase));
            return key == null ? null : context.InputParameters[key] as T;
        }

        private static Guid? ReadGuidInput(IPluginExecutionContext context, string name)
        {
            string key = context.InputParameters.Keys.FirstOrDefault(k => string.Equals(k, name, StringComparison.OrdinalIgnoreCase));
            if (key == null)
            {
                return null;
            }

            object value = context.InputParameters[key];
            if (value is Guid)
            {
                return (Guid)value;
            }

            Guid parsed;
            var text = value as string;
            return text != null && Guid.TryParse(text, out parsed) ? parsed : (Guid?)null;
        }
    }
}
