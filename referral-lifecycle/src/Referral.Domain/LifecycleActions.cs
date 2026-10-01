using System;

namespace Referral.Domain
{
    /// <summary>Actions a caller can run against a single Referral Item.</summary>
    public enum ItemAction
    {
        StartReview,
        RequestInformation,
        Resubmit,
        Onward,
        Authorise,
        AuthoriseWithRecommendations,
        AuthoriseWithConditions,
        Reject,
        CreateRevision,
        Cancel
    }

    /// <summary>Actions a caller can run against a Referral Request (the parent).</summary>
    public enum ParentAction
    {
        Submit,
        SubmitRevisions,
        CompletePartial,
        CompleteRejected,
        Cancel
    }

    /// <summary>
    /// Turns the ActionName text sent by the Custom API caller into an enum.
    /// The names are the ones the deployed command bar script already sends.
    /// </summary>
    public static class ActionNameParser
    {
        public static ItemAction ParseItemAction(string actionName)
        {
            return Parse<ItemAction>(actionName, "Referral Item");
        }

        public static ParentAction ParseParentAction(string actionName)
        {
            return Parse<ParentAction>(actionName, "Referral Request");
        }

        private static T Parse<T>(string actionName, string target) where T : struct
        {
            bool looksLikeName = !string.IsNullOrWhiteSpace(actionName) && char.IsLetter(actionName.Trim()[0]);
            T parsed;
            if (looksLikeName && Enum.TryParse(actionName.Trim(), true, out parsed) && Enum.IsDefined(typeof(T), parsed))
            {
                return parsed;
            }

            throw new LifecycleException(
                LifecycleErrorCodes.UnknownAction,
                "Unknown " + target + " action '" + actionName + "'.");
        }
    }
}
