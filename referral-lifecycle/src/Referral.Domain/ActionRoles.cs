namespace Referral.Domain
{
    /// <summary>
    /// The POC "action role" a user needs before they may run a command. A role only says the user takes part in that
    /// side of the process. It is NOT proof of underwriting authority: eligibility is always checked separately against
    /// the user's Underwriting Authority assignment.
    /// </summary>
    public enum ActionRole
    {
        Requestor,
        Approver
    }

    /// <summary>
    /// POC mapping from each command to the team that may start it. Kept in one place so the production access model can
    /// replace it later. There is deliberately no "Manager" concept in the POC.
    /// </summary>
    public static class ActionRoleRules
    {
        public const string RequestorTeamName = "SL Referral Requestors";
        public const string ApproverTeamName = "SL Referral Approvers";

        public static string TeamName(ActionRole role)
        {
            return role == ActionRole.Requestor ? RequestorTeamName : ApproverTeamName;
        }

        public static ActionRole RoleFor(ItemAction action)
        {
            switch (action)
            {
                case ItemAction.Resubmit:
                case ItemAction.CreateRevision:
                case ItemAction.Cancel:
                    return ActionRole.Requestor;
                default:
                    // StartReview, RequestInformation, Onward, Authorise (all forms) and Reject.
                    return ActionRole.Approver;
            }
        }

        /// <summary>Every referral-level command (Submit, Submit Revisions, Cancel, Complete Partial, Accept Rejection) is a requestor action.</summary>
        public static ActionRole RoleFor(ParentAction action)
        {
            return ActionRole.Requestor;
        }
    }
}
