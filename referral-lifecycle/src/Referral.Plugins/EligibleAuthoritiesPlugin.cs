using System.Collections.Generic;
using System.Text;
using Referral.Application;
using Referral.Dataverse;

namespace Referral.Plugins
{
    /// <summary>
    /// Main-operation plug-in for the slcrm_GetEligibleAuthorities Custom API (bound to slcrm_referralitem).
    /// Read-only. Returns the authority assignments the item can be sent onward to, as JSON in AuthoritiesJson.
    /// </summary>
    public class EligibleAuthoritiesPlugin : LifecyclePluginBase
    {
        public const string AuthoritiesOutputName = "AuthoritiesJson";

        protected override string MessageName
        {
            get { return "slcrm_GetEligibleAuthorities"; }
        }

        protected override string TargetTable
        {
            get { return Schema.Item.Table; }
        }

        protected override bool RequiresActionName
        {
            get { return false; }
        }

        protected override IDictionary<string, object> Run(PluginCall call, LifecycleServices services)
        {
            var service = new EligibleAuthorityService(services.Repository, services.Settings, services.Clock, services.Trace);
            IList<EligibleAuthority> found = service.Find(call.TargetId, call.CallerId);

            return new Dictionary<string, object> { { AuthoritiesOutputName, ToJson(found) } };
        }

        /// <summary>A small hand-written serializer: four fields per row, so no JSON library is needed.</summary>
        public static string ToJson(IList<EligibleAuthority> authorities)
        {
            var json = new StringBuilder("[");
            for (int i = 0; i < authorities.Count; i++)
            {
                EligibleAuthority a = authorities[i];
                if (i > 0)
                {
                    json.Append(',');
                }

                json.Append("{\"id\":\"").Append(a.AssignmentId.ToString("D")).Append("\",")
                    .Append("\"name\":").Append(Quote(a.AssignmentName)).Append(',')
                    .Append("\"level\":").Append(Quote(a.LevelName)).Append(',')
                    .Append("\"rank\":").Append(a.Rank).Append('}');
            }

            return json.Append(']').ToString();
        }

        private static string Quote(string text)
        {
            var quoted = new StringBuilder("\"");
            foreach (char c in text ?? string.Empty)
            {
                switch (c)
                {
                    case '"': quoted.Append("\\\""); break;
                    case '\\': quoted.Append("\\\\"); break;
                    case '\n': quoted.Append("\\n"); break;
                    case '\r': quoted.Append("\\r"); break;
                    case '\t': quoted.Append("\\t"); break;
                    default:
                        if (c < ' ')
                        {
                            quoted.Append("\\u").Append(((int)c).ToString("x4"));
                        }
                        else
                        {
                            quoted.Append(c);
                        }
                        break;
                }
            }

            return quoted.Append('"').ToString();
        }
    }
}
