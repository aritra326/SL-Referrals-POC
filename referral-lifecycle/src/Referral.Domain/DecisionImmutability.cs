using System;
using System.Collections.Generic;
using System.Linq;

namespace Referral.Domain
{
    /// <summary>
    /// Referral Decision rows are audit evidence: once created they are never updated or deleted by normal operation.
    /// The only way around this is the explicit maintenance setting (slcrm_AllowDecisionMaintenance), meant for migration
    /// or administration, which is off by default.
    /// </summary>
    public static class DecisionImmutability
    {
        /// <summary>Throws SLR-DECISION-IMMUTABLE when the change is not allowed.</summary>
        /// <param name="isDelete">True for a delete, false for an update.</param>
        /// <param name="changedColumns">The columns an update is trying to change (ignored for deletes).</param>
        /// <param name="protectedColumns">The evidence columns that may not change.</param>
        /// <param name="allowMaintenance">The explicit administration exception.</param>
        public static void Require(bool isDelete, IEnumerable<string> changedColumns, IEnumerable<string> protectedColumns, bool allowMaintenance)
        {
            if (allowMaintenance)
            {
                return;
            }

            if (isDelete)
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.DecisionImmutable,
                    "A referral decision is permanent audit evidence and cannot be deleted.");
            }

            var protectedSet = new HashSet<string>(protectedColumns, StringComparer.OrdinalIgnoreCase);
            List<string> touched = changedColumns.Where(protectedSet.Contains).ToList();
            if (touched.Count > 0)
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.DecisionImmutable,
                    "A referral decision is permanent audit evidence and cannot be changed (" + string.Join(", ", touched) + ").");
            }
        }
    }
}
