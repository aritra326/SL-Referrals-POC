namespace Referral.Domain
{
    /// <summary>
    /// Status of a Referral Item. These are business meanings, not Dataverse numbers.
    /// The Dataverse layer maps each one to the live option value by its label.
    /// </summary>
    public enum ItemStatus
    {
        Draft,
        Submitted,
        InReview,
        MoreInformationNeeded,
        Resubmitted,
        OnwardForApproval,
        RevisionDraft,
        Authorised,
        AuthorisedWithRecommendations,
        AuthorisedWithConditions,
        Rejected,
        Cancelled,
        Superseded
    }

    /// <summary>Status of a Referral Request (the parent). Business meanings, not Dataverse numbers.</summary>
    public enum ParentStatus
    {
        Draft,
        SentForApproval,
        MoreInformationRequired,
        OnwardForApproval,
        PartiallyAuthorisedActionRequired,
        RevisionInProgress,
        RejectedActionRequired,
        Authorised,
        AuthorisedWithRecommendations,
        AuthorisedWithConditions,
        PartiallyAuthorisedCompleted,
        Rejected,
        Cancelled
    }

    /// <summary>The kind of decision recorded in a Referral Decision row.</summary>
    public enum DecisionType
    {
        Authorised,
        AuthorisedWithRecommendation,
        MoreInformationNeeded,
        OnwardForApproval,
        Rejected
    }

    /// <summary>Which way "higher authority" runs on the Authority Level comparison rank.</summary>
    public enum RankDirection
    {
        /// <summary>Rank 7 outranks rank 3. This is the spec's default.</summary>
        HigherNumberGreater,

        /// <summary>Rank 3 outranks rank 7.</summary>
        LowerNumberGreater
    }
}
