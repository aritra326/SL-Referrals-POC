# Schema map

Everything here was read from the live **Dev** environment (`https://61858932.crm17.dynamics.com`, solution
`SL_Referrals`, publisher **SL CRM**, prefix `slcrm_`) on 2026-10-01. The code never contains these numbers: it
looks options up **by label** at run time (`OptionLabels.cs` + `OptionValueResolver.cs`), so a different environment
with different numbers still works as long as the labels match.

Column names are centralised in `src/Referral.Dataverse/Schema.cs`. If a name changes in Dataverse, change it there.

## Tables

| Business name | Logical name | Entity set | Role |
|---|---|---|---|
| Referral Request | `slcrm_referralrequest` | `slcrm_referralrequests` | Parent. One per referral. |
| Referral Item | `slcrm_referralitem` | `slcrm_referralitems` | Child. One per reason/cover. Optimistic concurrency is **on**. |
| Referral Decision | `slcrm_referraldecision` | `slcrm_referraldecisions` | Permanent decision history. Created only by the plug-in. |
| Underwriting Authority | `slcrm_underwriterauthority` | `slcrm_underwriterauthorities` | An underwriter's authority for one product at one level. |
| Authority Level | `slcrm_authoritylevel` | `slcrm_authoritylevels` | Level with a comparison rank and "can approve referrals". |
| Product | `slcrm_product` | `slcrm_products` | Referral product; also the authority's "product / class of business". |

## Relationships used

| From (lookup column) | To |
|---|---|
| `slcrm_referralitem.slcrm_referral` | Referral Request (parent) |
| `slcrm_referralitem.slcrm_underwriterauthority` | Underwriting Authority (the assignment responsible for the item) |
| `slcrm_referralitem.slcrm_assignedapprover` | System User |
| `slcrm_referralitem.slcrm_requiredauthoritylevel` | Authority Level |
| `slcrm_referralitem.slcrm_previousreferralitem` / `slcrm_rootreferralitem` | Referral Item (revision lineage) |
| `slcrm_referraldecision.slcrm_referralitem` / `slcrm_referral` | Item / Request the decision belongs to |
| `slcrm_referraldecision.slcrm_onwardauthorityassignment` / `slcrm_authorityassignmentused` | Underwriting Authority |
| `slcrm_underwriterauthority.slcrm_authoritylevel` | Authority Level |
| `slcrm_underwriterauthority.slcrm_productclassofbusiness` | Product |
| `slcrm_underwriterauthority.slcrm_underwriter` | System User |
| `slcrm_referralrequest.slcrm_primaryunderwriter` / `slcrm_product` | System User / Product |

## Referral Request status reasons (`statuscode`)

| Business status (code) | Label in Dataverse | State |
|---|---|---|
| `ParentStatus.Draft` | Draft | Active |
| `SentForApproval` | Sent for Approval | Active |
| `MoreInformationRequired` | More Information Required | Active |
| `OnwardForApproval` | Onward for Approval | Active |
| `PartiallyAuthorisedActionRequired` | Partially Authorised - Action Required | Active |
| `RevisionInProgress` | Revision in Progress | Active |
| `RejectedActionRequired` | Rejected - UW Action Required | Active |
| `Authorised` | Authorised | Inactive |
| `AuthorisedWithRecommendations` | Authorised with Recommendations | Inactive |
| `AuthorisedWithConditions` | Authorised with Conditions | Inactive |
| `PartiallyAuthorisedCompleted` | Partially Authorised - Completed | Inactive |
| `Rejected` | Rejected | Inactive |
| `Cancelled` | Cancelled / No Longer Required | Inactive |

The brief also lists "Superseded" and "Parent Partially Authorised - Completed" as parent states. **Neither exists
on the parent in this environment** (only the single "Partially Authorised - Completed"). "Superseded" exists on the
*item* only. The code follows the environment.

## Referral Item status reasons (`statuscode`)

| Business status (code) | Label in Dataverse | State |
|---|---|---|
| `ItemStatus.Draft` | Draft | Active |
| `Submitted` | Submitted | Active |
| `InReview` | In Review | Active |
| `MoreInformationNeeded` | More Information Needed | Active |
| `Resubmitted` | Resubmitted | Active |
| `OnwardForApproval` | Onward for Approval | Active |
| `RevisionDraft` | Revision Draft | Active |
| `Authorised` | Authorised | Inactive |
| `AuthorisedWithRecommendations` | Authorised with Recommendations | Inactive |
| `AuthorisedWithConditions` | Authorised with Conditions | Inactive |
| `Rejected` | Rejected | Inactive |
| `Cancelled` | Cancelled / No Longer Required | Inactive |
| `Superseded` | Superseded | Inactive. Set on the rejected row when it is revised (decision 9) |

**Wording differs from the referral on purpose of the environment, not the code:** an item is *Submitted* where a
referral is *Sent for Approval*; an item is *More Information Needed* where a referral is *More Information
Required*; an item is *Revision Draft* where a referral is *Revision in Progress*.

## Referral Decision

Decision type choice (`slcrm_decisiontype`): Authorised, Authorised With Recommendation, More Information Needed,
Onward for Approval, Rejected. **There is no "Conditions" decision type and none is to be created yet** (decision 2).

Decision `statuscode` is only Active/Inactive; new decisions use the default (Active). There is no "Recorded" status.

Columns written by the plug-in: `slcrm_name`, `slcrm_referralitem`, `slcrm_referral`, `slcrm_decisionby`,
`slcrm_decisionon` (UTC, set by the server), `slcrm_decisiontype`, `slcrm_decisionsequence`,
`slcrm_itemrevisionnumber`, `slcrm_previousitemstatus`, `slcrm_newitemstatus`, `slcrm_decisioncomments`,
`slcrm_recommendations` (**multiline, 4000 characters**; converted in place from 100 characters on 2026-10-01; written in full),
`slcrm_informationrequested`, `slcrm_rejectedreason`, `slcrm_onwardauthorityassignment`,
`slcrm_onwardapproversnapshot`, `slcrm_authorityassignmentused`, `slcrm_authoritylevelsnapshot`,
`slcrm_authorityranksnapshot`, `slcrm_correlationid`, and the two columns **added for decision snapshots**:
`slcrm_authoritylevelused` (lookup to Authority Level, delete restricted) and `slcrm_canapprovereferralssnapshot` (Yes/No).
The deciding user is `slcrm_decisionby`; the server timestamp is `slcrm_decisionon`.

Deprecated columns kept for now (do not use for new work): `slcrm_selectedunderwritingauthority` on Referral Item (the
canonical column is `slcrm_underwriterauthority`) and `slcrm_openitemcount` on Referral Request (canonical:
`slcrm_opencurrentitemcount`). The item's `slcrm_product` is informational; eligibility uses the Referral Request's product.

Not written (no Custom API parameter to carry them): `slcrm_clientrequestid`.

## Underwriting Authority

Status reasons: **Current** (Active), Suspended, Expired, Revoked (all Inactive). "Current" is the only one that
counts as in force.

## Authority Level (seed data)

| Code | Name | Rank | Can approve referrals |
|---|---|---|---|
| 1 to 7 | Level 1 to Level 7 | 1 to 7 | Yes |
| C | Level C | 8 | **No** |

## Custom APIs

| Unique name | Bound to | Request parameters | Response |
|---|---|---|---|
| `slcrm_ExecuteReferralItemAction` | `slcrm_referralitem` | `ActionName` (String, required), `Comment` (String), `NewAuthorityId` (Guid, optional) | `ResultRecordId` (Guid) |
| `slcrm_ExecuteReferralRequestAction` | `slcrm_referralrequest` | `ActionName` (String, required), `Comment` (String), `NewAuthorityId` (Guid, optional) | `ResultRecordId` (Guid) |
| `slcrm_GetEligibleAuthorities` | `slcrm_referralitem` | none | `AuthoritiesJson` (String): JSON array of `{id, name, approver, level, rank, licence, product}` |

History: the parameter was originally deployed as `NewAuthorityID` of type **Boolean**, which cannot carry an authority
and did not match the Guid `NewAuthorityId` sent by the command bar. On 2026-10-01 it was deleted and recreated on both
APIs as an optional **Guid** named `NewAuthorityId` (in the `SL_Referrals` solution). The plug-in still reads the name
ignoring case.

## Settings (Dataverse environment variables, created by this work)

| Schema name | Meaning | Value deployed |
|---|---|---|
| `slcrm_RankDirection` | `HigherNumberGreater` or `LowerNumberGreater` | `HigherNumberGreater` (**confirmed**: higher number = more authority) |
| `slcrm_EnableConditionalDecision` | Allow "Authorise with Conditions" | `false` (stays off for the POC) |
| `slcrm_EnablePartialCompletion` | Allow "Complete Partial Outcome" | `true` (current value; default `false`) |
| `slcrm_EnforceTeamRoles` | Require the matching team (SL Referral Requestors / Approvers) to run a command. A team that does not exist is not enforced | `true` |
| `slcrm_AllowDecisionMaintenance` | The single explicit exception to decision immutability (migration/administration) | `false` |

## Teams (POC)

`SL Referral Requestors` and `SL Referral Approvers` (Owner teams, created by an administrator). Membership gives an
action role only; it is never proof of underwriting authority. See [demo-authorization.md](demo-authorization.md).
