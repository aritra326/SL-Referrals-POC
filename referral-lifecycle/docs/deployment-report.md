# Deployment report: referral lifecycle plug-ins and decision dialog

Date: 2026-10-01. Target: **Dev** (trial) environment `https://61858932.crm17.dynamics.com`
(environment id `28d25f41-7cd0-ebcf-a27a-5e8c219d9d45`), solution **SL_Referrals**, publisher **SL CRM** (`slcrm_`).
Solution version after deployment: **1.0.0.9**.

## Safety checks before deploying

* Confirmed the target with `pac org who` (friendly name "Dev", the trial environment named by the product owner).
* Recoverable copies taken **before** any lifecycle change, committed to `solution-export/`:
  `SL_Referrals_1_0_0_8_before_lifecycle_unmanaged.zip` and `..._managed.zip`.
* Nothing was deleted from the environment except what is listed under "Replaced" below.

## What was deployed

| Component | Detail |
|---|---|
| Plug-in assembly | `SLCRM.ReferralLifecycle` 1.0.0.0, public key token `77174e1f2c168bf6`, sandbox, database. One merged, strong-named DLL built by `scripts/Build-PluginAssembly.ps1` (SDK 9.0.318, net462). Registered into SL_Referrals. |
| Plug-in types | `Referral.Plugins.ReferralItemActionPlugin`, `Referral.Plugins.ReferralRequestActionPlugin` |
| Binding | Each type set as the main-operation plug-in of `slcrm_ExecuteReferralItemAction` / `slcrm_ExecuteReferralRequestAction`. No message steps or images. |
| Custom API parameter | `NewAuthorityID` (Boolean) replaced on both APIs by `NewAuthorityId` (Guid, optional). |
| Environment variables | `slcrm_RankDirection` = `HigherNumberGreater` (unconfirmed assumption), `slcrm_EnableConditionalDecision` = `false`, `slcrm_EnablePartialCompletion` = `false` |
| Web resources | New: `slcrm_referraldecision.html`, `slcrm_referraldecision.js`. Updated: `slcrm_ReferralCommands.js` (Authorise, Reject and the other comment actions now open the new dialog). |

Method: the solution zip was exported, the web resources were added to the zip by `scripts/New-DeploymentZip.ps1`, and the
zip was imported with `pac solution import` (not `pac solution pack`, which drops Custom APIs). The assembly was then
registered through the Web API, using a **temporary** web resource (`slcrm_zz_lifecycle_assembly.js`) to carry the DLL
bytes; the bytes were verified against the local SHA-256 before registering. After a bug found in smoke testing the
assembly was updated in place with `pac plugin push`.

Replaced: the Boolean Custom API parameter (deleted and recreated as a Guid at your request) and the old
`slcrm_ReferralCommands.js` content.

## Test results

### Automated (SDK 9.0.318, net462 and node)

| Suite | Tests | Result |
|---|---|---|
| Referral.Domain.Tests | 103 | passed |
| Referral.Application.Tests | 68 | passed |
| Referral.Dataverse.Tests | 28 | passed |
| Referral.Plugins.Tests | 25 | passed |
| Referral.Dialog (jest) | 34 | passed |

These use fakes and mocks. See [integration-test-plan.md](integration-test-plan.md) for what they cannot prove.

### Smoke test in the environment (test records `SMOKE-REF-1` to `SMOKE-REF-4` only)

| Check | Result |
|---|---|
| Submit two draft items | Items Submitted, referral Sent for Approval, counts 2 total / 2 open |
| Authorise item 1 | Decision seq 1 with Level 5 / rank 5 snapshot; referral stays Sent for Approval |
| Reject with an empty reason | Refused, `SLR-DECISION-FIELD`, nothing written |
| Reject item 2 with a reason | Decision recorded; referral Partially Authorised - Action Required |
| Repeat Authorise on item 1 | Refused, `SLR-STATUS-409`; still one decision for that item |
| Create revision of the rejected item | New Revision Draft (rev 2); old row not current, still Rejected; referral Revision in Progress |
| Second create revision | Refused (replaced by newer revision) |
| Submit revisions without a change summary | Refused, `SLR-RESUBMIT-ITEM` |
| Submit revisions with a change summary | Revision Resubmitted; referral Sent for Approval |
| Authorise with a 250-character recommendation | Comments hold all 250 characters, the 100-character column holds the shortened copy; referral Authorised with Recommendations |
| Onward with `NewAuthorityId` (Guid) | Parameter reached the plug-in; refused because the seeded target underwriter is disabled (`SLR-AUTH-USER`) |
| Onward without an authority | Initially wrong message (an empty Guid was treated as supplied). **Bug found and fixed** (assembly updated); now `SLR-AUTH-MISSINGINPUT: Choose the authority...` |
| Onward to your own authority | Refused, `SLR-ONWARD-RANK` |
| Cancel without a reason / with a reason / again | Refused / items and referral Cancelled, explicit-cancel flag set / refused (`SLR-CANCEL-TERMINAL`) |
| Decision dialog opened for an item | Showed item number, referral, status and the reason box |
| Dialog: Reject with an empty reason | Validation message shown, no request sent |
| Dialog: confirm a reason, two rapid clicks | Exactly **one** decision recorded; item Rejected; referral Rejected - UW Action Required; dialog closed itself |

Not exercised in the environment (covered by unit tests only): wrong-caller refusal (there is one test user),
expired authority, missing rank-direction setting, concurrent edits. These are items 2, 7, 10 and 6 in
[integration-test-plan.md](integration-test-plan.md); run them with a second test user.

## Known limitations

See [open-questions.md](open-questions.md). In short: Onward has no authority-picker screen yet (the API now supports
it); Authorise with Conditions and Complete Partial are off; rank direction is an unconfirmed assumption; "Manager"
overrides are not implemented.

## Steps a human still needs to do

1. Answer the open questions, in particular rank direction (item 4) and which authority column is the real one (item 5).
2. Give normal users **no** Create/Write/Delete on Referral Decision in security roles (decisions must stay immutable).
3. Run the checks that need a second user (see above).
4. Delete the `SMOKE-REF-*` test referrals and their decisions when finished with them.
5. Decide whether to build the Onward authority picker, and whether to remove the "Cancel Item" button.

---

# Deployment 2: confirmed POC decisions (solution 1.0.0.11)

Date: 2026-10-01, same Dev environment and solution. Baseline taken before this round: the 1.0.0.9 and 1.0.0.10 states are
in `solution-export/` (1.0.0.10 was exported as the base for the 1.0.0.11 import and is superseded by the final 1.0.0.11 exports).

## What changed in the environment

| Change | Detail |
|---|---|
| Plug-in assembly | Updated in place with `pac plugin push` (91,648 bytes). New types: `EligibleAuthoritiesPlugin`, `ReferralDecisionGuardPlugin` |
| Custom API | `slcrm_GetEligibleAuthorities` (bound to Referral Item, response `AuthoritiesJson`) bound to `EligibleAuthoritiesPlugin` |
| Plug-in steps | Two Pre-Operation, synchronous steps on Referral Decision: **Update** (filtering attributes = the evidence columns) and **Delete** |
| New columns on Referral Decision | `slcrm_authoritylevelused` (lookup to Authority Level, delete restricted) and `slcrm_canapprovereferralssnapshot` (Yes/No) |
| Changed column | `slcrm_recommendations`: single line 100 characters -> **multiline, 4000 characters**, converted in place |
| Environment variables | New: `slcrm_EnforceTeamRoles` (default true), `slcrm_AllowDecisionMaintenance` (default false). Set: `slcrm_EnablePartialCompletion` = true (current value) |
| Command bar | App action "Cancel item" on Referral Item set to hidden |
| Web resources | `slcrm_referraldecision.html/.js` (picker table, new wording) and `slcrm_ReferralCommands.js` (cancel-item safeguard; demo guard; Onward through the dialog), imported as 1.0.0.11 |

Not done by the tooling because they are security changes: creating the two Owner teams and tightening security roles. See
[demo-authorization.md](demo-authorization.md) and [open-questions.md](open-questions.md) section 3.

## Test results

| Suite | Tests | Result |
|---|---|---|
| Referral.Domain.Tests | 127 | passed |
| Referral.Application.Tests | 114 | passed |
| Referral.Dataverse.Tests | 40 | passed |
| Referral.Plugins.Tests | 39 | passed |
| Referral.Dialog (jest) | 84 | passed |

Every changed rule has tests; the mapping from decision to tests is in [decisions.md](decisions.md).

## Smoke test in the environment (records `SMOKE-REF-4` to `SMOKE-REF-7`)

| Check | Result |
|---|---|
| Decision immutability | Editing an evidence column of an existing decision: refused `SLR-DECISION-IMMUTABLE`. Deleting it: refused. The row was unchanged afterwards |
| Decision snapshot | After Authorise with Recommendations: authority used, **Level 5 as authority level used**, rank 5, **can-approve = yes**, deciding user, decision time all stored |
| Full-length recommendations | A 2000-character recommendation stored in full in the Recommendations column (and in Comments) |
| Recommendation limit | 4001 characters refused with `SLR-DECISION-FIELD: Recommendations can be at most 4000 characters (you entered 4001)`; nothing written |
| Authorise with Conditions | Refused `SLR-FEATURE-001` |
| Complete Partial Outcome | Referral became **Partially Authorised - Completed** (inactive); the rejected item stayed **Rejected**; the comment stored as the outcome summary |
| Superseded | After Reject then Create Revision: the old item is **Superseded**, inactive, not current, Superseded On set; its decision still reads Rejected; the new item is a Revision Draft; the referral is Revision in Progress |
| Counts | `slcrm_opencurrentitemcount` and the deprecated `slcrm_openitemcount` hold the same value |
| Onward picker (dialog, opened from the Referral Item command bar) | Showed a table: Approver, Level, Rank, Licence / scheme, Product, with the one eligible higher assignment and not my own or lower ones. Confirm with no choice or no reason: validation messages. Confirm with both: the item moved to the chosen assignment and approver, item and referral became Onward for Approval, the decision recorded the destination and the deciding authority's snapshot |
| Cancel Item | Not in the Referral Item command bar (the flyout lists Start Review, Authorise, Reject, Resubmit, Request more information, Authorise with recommendations, Authorise with condition, Route onward, Create revision) |

Not exercised in the environment (unit-tested only): the team rule (`SLR-ROLE-403`) because the two teams do not exist yet, wrong-caller,
expired authority, a missing rank setting, concurrent edits. These need the teams and a second test user.

## Problems found and fixed during deployment

1. **A byte-order mark stopped the dialog rendering.** Saving the HTML with PowerShell 5.1 `-Encoding utf8` added a BOM; the app showed "No data available".
   Fixed in the deployed file and the source, and a jest test (`webresourceFiles.test.ts`) now guards the uploaded files.
2. **An old browser tab kept showing "No data available" after the fix.** A fresh tab rendered the dialog correctly. If a dialog looks blank after a
   redeploy, hard-reload or open a new tab before suspecting the code.
3. The earlier empty-Guid bug (Onward without an authority) was fixed in the first deployment.

## Housekeeping

* The `SMOKE-REF-*` test referrals and the `SMOKE - Test Higher Authority - Marine Hull` assignment are still in Dev. Decision immutability now
  blocks deleting their decisions; use `slcrm_AllowDecisionMaintenance` for the clean-up (see [demo-authorization.md](demo-authorization.md)).
* Final packages: `SL_Referrals_1_0_0_11.zip` (unmanaged) and `SL_Referrals_1_0_0_11_managed.zip`.
