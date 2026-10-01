using System;

namespace Referral.Domain
{
    /// <summary>
    /// The facts about an Underwriting Authority assignment that the eligibility rule needs.
    /// The Dataverse layer fills this in; the rule below never touches Dataverse.
    /// </summary>
    public class AuthorityFacts
    {
        public Guid AssignmentId { get; set; }

        /// <summary>The assignment's display name, for example "Jane Smith - Marine Hull".</summary>
        public string AssignmentName { get; set; }

        public Guid? ProductId { get; set; }
        public Guid? UnderwriterId { get; set; }

        /// <summary>The assignment row is Active (not Suspended, Expired or Revoked).</summary>
        public bool IsActive { get; set; }

        /// <summary>The assignment's status reason is "Current".</summary>
        public bool StatusIsCurrent { get; set; }

        public DateTime? EffectiveFrom { get; set; }
        public DateTime? EffectiveTo { get; set; }

        public bool LevelIsActive { get; set; }
        public bool LevelCanApproveReferrals { get; set; }
        public int? LevelRank { get; set; }
        public string LevelName { get; set; }

        public bool UnderwriterIsDisabled { get; set; }
    }

    public class EligibilityResult
    {
        public bool IsEligible { get; private set; }
        public string Code { get; private set; }
        public string Message { get; private set; }

        public static EligibilityResult Eligible()
        {
            return new EligibilityResult { IsEligible = true };
        }

        public static EligibilityResult NotEligible(string code, string message)
        {
            return new EligibilityResult { IsEligible = false, Code = code, Message = message };
        }

        /// <summary>Throws a <see cref="LifecycleException"/> if the assignment is not eligible.</summary>
        public void ThrowIfNotEligible()
        {
            if (!IsEligible)
            {
                throw new LifecycleException(Code, Message);
            }
        }
    }

    /// <summary>
    /// Compares Authority Level ranks. The direction comes from configuration because it has not been
    /// confirmed by the product owner (see docs/open-questions.md).
    /// </summary>
    public static class RankRules
    {
        /// <summary>The assignment's level is high enough for the level the item requires.</summary>
        public static bool IsSufficient(int assignmentRank, int requiredRank, RankDirection direction)
        {
            return direction == RankDirection.HigherNumberGreater
                ? assignmentRank >= requiredRank
                : assignmentRank <= requiredRank;
        }

        /// <summary>The destination outranks the current assignment (used for onward routing).</summary>
        public static bool IsStrictlyHigher(int destinationRank, int currentRank, RankDirection direction)
        {
            return direction == RankDirection.HigherNumberGreater
                ? destinationRank > currentRank
                : destinationRank < currentRank;
        }

        /// <summary>Reads the configuration text. Anything else is a configuration error.</summary>
        public static RankDirection Parse(string configuredValue)
        {
            if (string.Equals(configuredValue, "HigherNumberGreater", StringComparison.OrdinalIgnoreCase))
            {
                return RankDirection.HigherNumberGreater;
            }

            if (string.Equals(configuredValue, "LowerNumberGreater", StringComparison.OrdinalIgnoreCase))
            {
                return RankDirection.LowerNumberGreater;
            }

            throw new LifecycleException(
                LifecycleErrorCodes.RankConfiguration,
                "The rank direction setting (slcrm_RankDirection) is missing or invalid. Ask an administrator to set it to HigherNumberGreater or LowerNumberGreater.");
        }
    }

    /// <summary>
    /// Is this authority assignment allowed to decide this referral item right now?
    /// Source: spec section 8.4. Only the checks the current schema can answer are included; the snapshot-integrity
    /// checks are not, because the snapshot columns do not exist in the environment (see docs/open-questions.md).
    /// Licence scheme, licence location, country and cover are intentionally NOT checked (spec 8.4).
    /// </summary>
    public static class AuthorityEligibilityRules
    {
        public static EligibilityResult Check(
            AuthorityFacts authority,
            Guid? referralProductId,
            int requiredRank,
            DateTime evaluationDateUtc,
            RankDirection direction)
        {
            if (authority == null)
            {
                return EligibilityResult.NotEligible(LifecycleErrorCodes.AuthorityMissingInput, "No authority assignment is set on this item.");
            }

            if (!referralProductId.HasValue || authority.ProductId != referralProductId)
            {
                return EligibilityResult.NotEligible(LifecycleErrorCodes.AuthorityProduct, "The authority assignment is for a different product than this referral.");
            }

            if (!authority.IsActive || !authority.StatusIsCurrent)
            {
                return EligibilityResult.NotEligible(LifecycleErrorCodes.AuthorityStatus, "The authority assignment is not current (it may be suspended, expired or revoked).");
            }

            DateTime today = evaluationDateUtc.Date;

            if (!authority.EffectiveFrom.HasValue || authority.EffectiveFrom.Value.Date > today)
            {
                return EligibilityResult.NotEligible(LifecycleErrorCodes.AuthorityStatus, "The authority assignment is not effective yet.");
            }

            if (authority.EffectiveTo.HasValue && authority.EffectiveTo.Value.Date < today)
            {
                return EligibilityResult.NotEligible(LifecycleErrorCodes.AuthorityExpired, "The authority assignment has expired.");
            }

            if (!authority.LevelIsActive || !authority.LevelCanApproveReferrals || !authority.LevelRank.HasValue)
            {
                return EligibilityResult.NotEligible(LifecycleErrorCodes.AuthorityRank, "The authority level cannot approve referrals.");
            }

            if (!RankRules.IsSufficient(authority.LevelRank.Value, requiredRank, direction))
            {
                return EligibilityResult.NotEligible(LifecycleErrorCodes.AuthorityRank, "The authority level is below the level this item requires.");
            }

            if (authority.UnderwriterIsDisabled)
            {
                return EligibilityResult.NotEligible(LifecycleErrorCodes.AuthorityUser, "The underwriter on this authority assignment is disabled.");
            }

            return EligibilityResult.Eligible();
        }
    }

    /// <summary>Settings read from Dataverse environment variables. All have safe defaults except the rank direction.</summary>
    public class LifecycleSettings
    {
        /// <summary>Null means the setting is missing; anything that needs a rank comparison then fails with CONFIG-RANK-001.</summary>
        public RankDirection? RankDirection { get; set; }

        /// <summary>Allows "Authorise with Conditions". Off by default until the product owner confirms it (spec 11.2).</summary>
        public bool EnableConditionalDecision { get; set; }

        /// <summary>Allows "Complete Partial Outcome". Off by default until the product owner confirms it (spec 11.2).</summary>
        public bool EnablePartialCompletion { get; set; }

        public RankDirection RequireRankDirection()
        {
            if (!RankDirection.HasValue)
            {
                return RankRules.Parse(null);
            }

            return RankDirection.Value;
        }
    }
}
