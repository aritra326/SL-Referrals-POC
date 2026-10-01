using System.Collections.Generic;
using System.Linq;
using Referral.Domain;

namespace Referral.Application
{
    /// <summary>
    /// One rule an item must pass before it can be submitted or resubmitted. Returns the problems it found (empty when fine).
    /// Reason-specific rules (fields required only for some referral reasons) are NOT defined yet. When they are, add a
    /// class that implements this interface and pass it to <see cref="SubmitValidator"/>; the use cases do not change.
    /// </summary>
    public interface ISubmitRule
    {
        IEnumerable<string> FindProblems(ItemRecord item, ParentRecord parent);
    }

    /// <summary>The fields every referral item needs, whatever its reason (POC scope).</summary>
    public class CommonSubmitFieldsRule : ISubmitRule
    {
        public IEnumerable<string> FindProblems(ItemRecord item, ParentRecord parent)
        {
            if (!item.ReferralReasonId.HasValue) yield return "referral reason";
            if (!item.CoverSectionId.HasValue) yield return "cover";
            if (string.IsNullOrWhiteSpace(item.ItemSummary)) yield return "item summary";
            if (string.IsNullOrWhiteSpace(item.ReferralDetails)) yield return "referral details";
            if (string.IsNullOrWhiteSpace(item.UnderwriterRationale)) yield return "underwriter rationale";
            if (!item.RequiredAuthorityLevelId.HasValue) yield return "required authority level";
            if (!item.AuthorityAssignmentId.HasValue) yield return "underwriting authority";
            if (!item.AssignedApproverId.HasValue) yield return "assigned approver";
        }
    }

    /// <summary>Runs every registered rule and reports all problems for an item together.</summary>
    public class SubmitValidator
    {
        private readonly IReadOnlyList<ISubmitRule> _rules;

        public SubmitValidator(params ISubmitRule[] rules)
        {
            _rules = rules.Length == 0 ? new ISubmitRule[] { new CommonSubmitFieldsRule() } : rules;
        }

        public void Require(ItemRecord item, ParentRecord parent)
        {
            List<string> problems = _rules.SelectMany(rule => rule.FindProblems(item, parent)).ToList();
            if (problems.Count > 0)
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.ValidationField,
                    "Item " + item.Label + " is missing: " + string.Join(", ", problems) + ".");
            }
        }
    }
}
