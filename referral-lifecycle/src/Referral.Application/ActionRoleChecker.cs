using System;
using Referral.Domain;

namespace Referral.Application
{
    /// <summary>
    /// POC check that the caller belongs to the team for the command they are running (SL Referral Requestors or
    /// SL Referral Approvers). It answers "does this user take part in this side of the process?" and nothing more.
    /// It never grants underwriting authority: eligibility is checked separately, from the Underwriting Authority assignment.
    ///
    /// A team that does not exist in the environment is not enforced, so nothing is locked before the teams are created.
    /// To replace this with the production access model, replace this class and the mapping in <see cref="ActionRoleRules"/>.
    /// </summary>
    public class ActionRoleChecker
    {
        private readonly IReferralRepository _repository;
        private readonly ILifecycleSettingsProvider _settings;
        private readonly ITrace _trace;

        public ActionRoleChecker(IReferralRepository repository, ILifecycleSettingsProvider settings, ITrace trace)
        {
            _repository = repository;
            _settings = settings;
            _trace = trace;
        }

        public void Require(ActionRole role, Guid callerId)
        {
            if (!_settings.Load().EnforceTeamRoles)
            {
                return;
            }

            string team = ActionRoleRules.TeamName(role);
            if (!_repository.TeamExists(team))
            {
                _trace.Write("Team '" + team + "' does not exist, so the " + role + " role is not enforced.");
                return;
            }

            if (!_repository.IsTeamMember(callerId, team))
            {
                throw new LifecycleException(
                    LifecycleErrorCodes.RoleRequired,
                    "This action is for members of the '" + team + "' team. Ask an administrator to add you if you need it.");
            }
        }
    }
}
