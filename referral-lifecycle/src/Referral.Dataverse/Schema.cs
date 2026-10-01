namespace Referral.Dataverse
{
    /// <summary>
    /// Every table and column name the lifecycle code uses, read from the live SL Referrals solution
    /// (publisher prefix "slcrm_"). If a name changes in Dataverse, change it here and nowhere else.
    /// Option values are NOT listed: they are looked up by label at run time (see OptionLabels).
    /// </summary>
    public static class Schema
    {
        public static class Item
        {
            public const string Table = "slcrm_referralitem";
            public const string Parent = "slcrm_referral";
            public const string IsCurrentRevision = "slcrm_iscurrentrevision";
            public const string RevisionNumber = "slcrm_revisionnumber";
            public const string LogicalItemId = "slcrm_logicalitemid";
            public const string CurrentUniquenessKey = "slcrm_currentuniquenesskey";
            public const string ItemNumber = "slcrm_referralitemnumber";
            public const string ItemSummary = "slcrm_itemsummary";
            public const string ReferralDetails = "slcrm_referraldetails";
            public const string UnderwriterRationale = "slcrm_underwriterrationale";
            public const string InformationResponse = "slcrm_informationresponse";
            public const string ChangeSummary = "slcrm_changesummary";
            public const string ReferralReason = "slcrm_referralreason";
            public const string CoverSection = "slcrm_coversection";
            public const string RequiredAuthorityLevel = "slcrm_requiredauthoritylevel";
            public const string AuthorityAssignment = "slcrm_underwriterauthority";
            public const string AssignedApprover = "slcrm_assignedapprover";
            public const string AssignedApproverSnapshot = "slcrm_assignedapproversnapshot";
            public const string PreviousItem = "slcrm_previousreferralitem";
            public const string RootItem = "slcrm_rootreferralitem";
            public const string ReviewStartedOn = "slcrm_reviewstartedon";
            public const string RespondedOn = "slcrm_respondedon";
            public const string SubmittedOn = "slcrm_submittedon";
            public const string SubmittedBy = "slcrm_submittedby";
            public const string SupersededOn = "slcrm_supersededon";

            /// <summary>Business fields copied from a rejected item onto its revision. Lifecycle and decision fields are not copied.</summary>
            public static readonly string[] CopiedToRevision =
            {
                "slcrm_referral", "slcrm_product", "slcrm_coversection", "slcrm_referralreason",
                "slcrm_itemsummary", "slcrm_referraldetails", "slcrm_underwriterrationale",
                "slcrm_requesteddecisionexception", "slcrm_requiredauthoritylevel",
                "slcrm_underwriterauthority", "slcrm_assignedapprover", "slcrm_assignedapproversnapshot",
                "slcrm_proposedduration", "slcrm_maxduration", "slcrm_requestedgeography",
                "slcrm_geographyexception", "slcrm_requestedlimit", "slcrm_currentauthoritylimit",
                "slcrm_proposedpremium", "slcrm_technicalpremium", "slcrm_pricingrationale",
                "slcrm_reinsurancetype", "slcrm_retentionamount", "slcrm_placementdetail",
                "slcrm_wordingtitle", "slcrm_currentwording", "slcrm_requestedwording",
                "slcrm_displayorder", "slcrm_sequence", "slcrm_detailtemplatesnapshot"
            };
        }

        public static class Parent
        {
            public const string Table = "slcrm_referralrequest";
            public const string HasEverBeenSubmitted = "slcrm_haseverbeensubmitted";
            public const string ExplicitlyCancelled = "slcrm_explicitlycancelled";
            public const string PrimaryUnderwriter = "slcrm_primaryunderwriter";
            public const string Product = "slcrm_product";
            public const string SubmittedOn = "slcrm_submittedon";
            public const string SubmittedBy = "slcrm_submittedby";
            public const string LastSubmittedOn = "slcrm_lastsubmittedon";
            public const string CancellationReason = "slcrm_cancellationreason";
            public const string CompletedOn = "slcrm_completedon";
            public const string CompletedBy = "slcrm_completedby";
            public const string OutcomeSummary = "slcrm_outcomesummary";
            public const string LastAggregatedOn = "slcrm_lastaggregatedon";
            public const string TotalItemCount = "slcrm_totalcurrentitemcount";
            public const string OpenItemCount = "slcrm_opencurrentitemcount";
            public const string OpenItemCountLegacy = "slcrm_openitemcount";
            public const string AuthorisedItemCount = "slcrm_authorisedcurrentitemcount";
            public const string RejectedItemCount = "slcrm_rejectedcurrentitemcount";
            public const string CancelledItemCount = "slcrm_cancelledcurrentitemcount";
        }

        public static class Decision
        {
            public const string Table = "slcrm_referraldecision";
            public const string Name = "slcrm_name";
            public const string Item = "slcrm_referralitem";
            public const string Parent = "slcrm_referral";
            public const string DecisionBy = "slcrm_decisionby";
            public const string DecisionOn = "slcrm_decisionon";
            public const string DecisionType = "slcrm_decisiontype";
            public const string Sequence = "slcrm_decisionsequence";
            public const string ItemRevisionNumber = "slcrm_itemrevisionnumber";
            public const string Comments = "slcrm_decisioncomments";
            public const string Recommendations = "slcrm_recommendations";
            public const string InformationRequested = "slcrm_informationrequested";
            public const string RejectedReason = "slcrm_rejectedreason";
            public const string OnwardAuthority = "slcrm_onwardauthorityassignment";
            public const string OnwardApproverSnapshot = "slcrm_onwardapproversnapshot";
            public const string AuthorityUsed = "slcrm_authorityassignmentused";
            public const string AuthorityLevelSnapshot = "slcrm_authoritylevelsnapshot";
            public const string AuthorityRankSnapshot = "slcrm_authorityranksnapshot";
            public const string PreviousItemStatus = "slcrm_previousitemstatus";
            public const string NewItemStatus = "slcrm_newitemstatus";
            public const string CorrelationId = "slcrm_correlationid";

            /// <summary>The Recommendations column is a 100-character text column in the environment.</summary>
            public const int RecommendationsMaxLength = 100;
        }

        public static class Authority
        {
            public const string Table = "slcrm_underwriterauthority";
            public const string Name = "slcrm_name";
            public const string Level = "slcrm_authoritylevel";
            public const string Product = "slcrm_productclassofbusiness";
            public const string Underwriter = "slcrm_underwriter";
            public const string EffectiveFrom = "slcrm_effectivefrom";
            public const string EffectiveTo = "slcrm_effectiveto";
        }

        public static class AuthorityLevel
        {
            public const string Table = "slcrm_authoritylevel";
            public const string Name = "slcrm_name";
            public const string Rank = "slcrm_comparisonrank";
            public const string CanApprove = "slcrm_canapprovereferrals";
        }

        public static class SystemUser
        {
            public const string Table = "systemuser";
            public const string FullName = "fullname";
            public const string IsDisabled = "isdisabled";
        }

        public static class Setting
        {
            public const string RankDirection = "slcrm_RankDirection";
            public const string EnableConditionalDecision = "slcrm_EnableConditionalDecision";
            public const string EnablePartialCompletion = "slcrm_EnablePartialCompletion";
        }

        public const string StatusCode = "statuscode";
        public const string StateCode = "statecode";
    }
}
