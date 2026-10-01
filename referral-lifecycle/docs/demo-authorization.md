# Demo authorization layer (temporary)

**Purpose:** for the demo, team membership gives each user an *action role*: who may **start** which command. It is
deliberately **not** the underwriting-authority rule, and it is deliberately easy to replace.

```
Team membership          -> action role: may this person START this kind of command?     (UI message + server check)
Underwriting Authority   -> business eligibility: may this person decide THIS item?        (server)
Custom API / plug-in     -> authoritative enforcement of both, plus state and ownership    (server)
```

Being a member of `SL Referral Approvers` means "this user takes part in the approval process". It does **not** mean "this
user may approve this referral": the plug-in still checks the applicable Underwriting Authority assignment, required level
and rank, can-approve, product, dates, and that the caller is the item's assigned approver. Likewise the Onward picker lists
**eligible authority assignments**, never "everyone in the Approver team". There is no Manager concept in the POC.

## Who may start what

| Action | Requestor team (`SL Referral Requestors`) | Approver team (`SL Referral Approvers`) |
|---|---|---|
| Create Referral | yes | optional (see below) |
| Submit | yes | no |
| Resubmit / Revise (Resubmit, Create Revision, Submit Revisions) | yes | no |
| Cancel Referral | yes | no |
| Accept Rejection | yes | no |
| Complete Partial Outcome | yes | no |
| Start Review | no | yes |
| Authorise | no | yes |
| Authorise with Recommendations | no | yes |
| Reject | no | yes |
| More Information Required | no | yes |
| Onward for Approval (and its picker) | no | yes |

A user in **both** teams can start everything. A user in **neither** is refused with a message naming the team to ask for.
Requestor actions that change an existing referral **also** still require the referral's **Primary Underwriter**.

## Where it is enforced

| Layer | What it does | Code | Setting |
|---|---|---|---|
| **Server** (authoritative) | Refuses with `SLR-ROLE-403` when the caller is not in the matching team | `ActionRoleChecker`, `ActionRoleRules` | `slcrm_EnforceTeamRoles` (default true; set false to switch off) |
| **Browser** (convenience) | Shows a clear message at click time, before anything is saved or called | `DEMO_ACCESS` block in `src/Referral.Dialog/commands/slcrm_ReferralCommands.js` | n/a |

Rules that apply to both layers:

* **A team that does not exist in the environment is not enforced**, so nobody is locked out before the teams are created.
* The browser layer **never blocks on a failed team lookup** (the server still enforces the real rules). It remembers the
  answer for 5 minutes per browser tab.
* **Buttons stay visible.** The app's buttons are modern app actions; hiding them by team needs a Command Designer visibility
  formula (deferred; see [open-questions.md](open-questions.md)). Until then a user without the right team sees the button
  and gets a clear message.
* **Create Referral** (the Referral Builder entry point) and **Copy Rationale** are not gated by this layer yet.
* **Never rely on command-bar visibility for security.** The server is the boundary.

## Set-up for an administrator (security changes, so not done by the developer tooling)

1. **Create two Owner teams** in the **Dev** environment (Power Platform admin center, *Settings > Users + permissions > Teams*),
   in the right business unit. The names must match exactly:
   * `SL Referral Requestors`
   * `SL Referral Approvers`

   The teams need **no security role** for this layer to work (a role is only needed if you want them to open the app).
2. **Add members.** Put each test user in the team that matches what they should be able to start; a demo user who plays both
   roles goes in both.
3. **Reload the app** (or wait 5 minutes) so the cached membership refreshes.
4. **Tighten security roles (defence in depth for decision immutability):** for every role that is used with this app,
   open *Customization > Custom entities > Referral Decision* and set **Write** and **Delete** to **None**. Keep Create,
   Read, Append and Append To as they are. The plug-in already refuses edits and deletes; the role change makes the
   permissions agree with it.
5. To remove the `SMOKE-REF-*` test data later, set `slcrm_AllowDecisionMaintenance` to `true` only for as long as the
   clean-up takes, then set it back to `false`. That setting is the single, explicit exception to decision immutability.

## Replacing it later

* Different team names: change `ActionRoleRules.RequestorTeamName / ApproverTeamName` and `DEMO_ACCESS.teams`.
* Production access model: replace `ActionRoleChecker` (server) and the marked `DEMO ACCESS` block (browser). Nothing else
  depends on them; the eligibility rules, state machine and decision recording are unaffected.
* Prefer the platform's own mechanism when ready: put the same rule in each button's Command Designer visibility formula.

## Tests

* Server: `TeamRoleTests`, `ActionRoleRulesTests` (every command's role, missing team not enforced, setting off,
  team membership never replacing authority or the assigned-approver rule, picker lists assignments not team members).
* Browser: `src/Referral.Dialog/tests/commands.test.ts` (each approver action refused to a requestor, each requestor action
  refused to an approver, both teams, neither team, teams not created, failed lookup, caching, refusal before any save).
