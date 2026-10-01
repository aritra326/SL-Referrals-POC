using System;

namespace Referral.Domain
{
    /// <summary>Error codes shown to users and written to traces. Codes follow the original spec.</summary>
    public static class LifecycleErrorCodes
    {
        public const string NotFound = "SLR-NOTFOUND";
        public const string UnknownAction = "SLR-VAL-ACTION";
        public const string ActionUnsupported = "SLR-ACTION-UNSUPPORTED";
        public const string StatusConflict = "SLR-STATUS-409";
        public const string ConcurrencyConflict = "SLR-CONCURRENCY-412";
        public const string NotPermitted = "SLR-AUTH-403";
        public const string AuthorityMissingInput = "SLR-AUTH-MISSINGINPUT";
        public const string AuthorityStatus = "SLR-AUTH-STATUS";
        public const string AuthorityProduct = "SLR-AUTH-PRODUCT";
        public const string AuthorityExpired = "SLR-AUTH-EXPIRED";
        public const string AuthorityRank = "SLR-AUTH-RANK";
        public const string AuthorityUser = "SLR-AUTH-USER";
        public const string DecisionField = "SLR-DECISION-FIELD";
        public const string OnwardRank = "SLR-ONWARD-RANK";
        public const string FeatureDisabled = "SLR-FEATURE-001";
        public const string SubmitNoItems = "SLR-SUBMIT-NOITEMS";
        public const string ValidationField = "SLR-VAL-FIELD";
        public const string ResubmitItem = "SLR-RESUBMIT-ITEM";
        public const string RevisionState = "SLR-REVISION-STATE";
        public const string RevisionExists = "SLR-REVISION-EXISTS";
        public const string CancelTerminal = "SLR-CANCEL-TERMINAL";
        public const string CancelReason = "SLR-CANCEL-REASON";
        public const string AcknowledgementRequired = "SLR-ACK-REQUIRED";
        public const string AggregationAllCancelled = "SLR-AGG-ALLCANCELLED";
        public const string AggregationUnsupported = "SLR-AGG-UNSUPPORTED";
        public const string RankConfiguration = "CONFIG-RANK-001";
    }

    /// <summary>
    /// A business rule was broken in a way the user can correct. The message is safe to show to users.
    /// The plug-in turns this into an InvalidPluginExecutionException, which rolls back the whole action.
    /// </summary>
    public class LifecycleException : Exception
    {
        public LifecycleException(string code, string message) : base(code + ": " + message)
        {
            Code = code;
            UserMessage = message;
        }

        /// <summary>One of <see cref="LifecycleErrorCodes"/>.</summary>
        public string Code { get; private set; }

        /// <summary>The message without the code prefix.</summary>
        public string UserMessage { get; private set; }
    }
}
