# Lifecycle: what the plug-in enforces

Source: spec section 11 ([version-controlled copy](specification/README.md)) as amended by the
[confirmed POC decisions](decisions.md), which win where they differ. Every rule below is implemented and unit-tested.
Rules still waiting for a decision are **not** here; they are in [open-questions.md](open-questions.md).

All commands run **server-side** inside the Custom API's main-operation plug-in, in one Dataverse transaction: if any
check or write fails, every write made so far is rolled back. The dialog and command bar are conveniences only.

| Operation | Plug-in class | Use case |
|---|---|---|
| Any action on a Referral Item | `ReferralItemActionPlugin` | `ItemActionService` |
| Any action on a Referral Request | `ReferralRequestActionPlugin` | `ParentActionService` |

## Item actions (`slcrm_ExecuteReferralItemAction`)

Common checks, in this order: the item is the **current revision**, the referral is **still open**, the action is
**allowed from the item's status**, the caller has the **action role** (team, see below), the **caller** is the right
person (assigned approver or primary underwriter), then input and authority checks.

| ActionName | Allowed from | Leads to | Who may run it | Extra rules | Decision row |
|---|---|---|---|---|---|
| `StartReview` | Submitted, Resubmitted, Onward for Approval | In Review | Assigned approver | Authority eligible | No |
| `Authorise` | Submitted, In Review, Resubmitted, Onward for Approval | Authorised | Assigned approver | Authority eligible. Comment optional. | Authorised |
| `AuthoriseWithRecommendations` | same | Authorised with Recommendations | Assigned approver | Recommendations (comment) required | Authorised With Recommendation |
| `RequestInformation` | same | More Information Needed | Assigned approver | Information text (comment) required | More Information Needed |
| `Reject` | same | Rejected | Assigned approver | Reason (comment) required | Rejected |
| `Onward` | same | Onward for Approval | Assigned approver | Comment and `NewAuthorityId` required; destination eligible, **strictly higher** rank, not yourself, not the same assignment. Moves the item to the new authority and approver. The dialog's picker offers only choices the server will accept (see below). | Onward for Approval |
| `Resubmit` | More Information Needed, Revision Draft | Resubmitted | Primary underwriter | Information response (or change summary for a revision) not blank; authority re-checked | No |
| `CreateRevision` | Rejected | **New** item in Revision Draft. The rejected row becomes **Superseded**: immutable, no longer current, `SupersededOn` set; its rejection stays in the decision history | Primary underwriter | Referral is Rejected - UW Action Required or Partially Authorised - Action Required; no revision exists yet | No |
| `AuthoriseWithConditions` | n/a | **Refused** | n/a | Switch off by default **and** no matching decision type exists | n/a |
| `Cancel` | n/a | **Refused** with a message to cancel the referral | n/a | Decided: no item-level cancel in the POC (the command is hidden) | n/a |

Every decision gets the next **sequence number** for the item and the **snapshot** of the authority behind it (below).
Decisions are only ever created, never edited or deleted (immutability, below).

## Action roles (POC)

Before the caller checks, each command needs the caller to be in the matching team: `SL Referral Approvers` for Start Review,
Authorise (all forms), Reject, Request information and Onward; `SL Referral Requestors` for Submit, Resubmit, Revise,
Cancel Referral, Accept Rejection and Complete Partial. A team that does not exist is not enforced; `slcrm_EnforceTeamRoles`
switches the check off. **A role is not authority**: eligibility is always checked from the Underwriting Authority assignment.
See [demo-authorization.md](demo-authorization.md). Refusal code: `SLR-ROLE-403`.

## Decision snapshot

When a decision is recorded the plug-in stores the evidence on the decision row, so changing the live Authority Level
later cannot rewrite why the decision was valid: the authority assignment id, the **authority level id**
(`slcrm_authoritylevelused`), the level name, the **comparison rank**, whether the level **can approve referrals**
(`slcrm_canapprovereferralssnapshot`), the deciding user and the server timestamp. Eligibility *before* a decision uses live data.

## Decision immutability

Referral Decision rows are audit evidence. `ReferralDecisionGuardPlugin` runs Pre-Operation on **Update** (only when an
evidence column is in the change) and on **Delete**, and refuses with `SLR-DECISION-IMMUTABLE`. The only exception is the
explicit, off-by-default setting `slcrm_AllowDecisionMaintenance` (migration or administration). Creating decisions is never blocked.

## Onward picker (`slcrm_GetEligibleAuthorities`, read-only)

Bound to Referral Item, no inputs, returns `AuthoritiesJson` (`[{id, name, approver, level, rank, licence, product}]`). Plug-in:
`Referral.Plugins.EligibleAuthoritiesPlugin`; use case: `EligibleAuthorityService`.

* Only the item's **assigned approver** (who must also be in the Approver team) may ask, and only while the item can still be sent onward.
* An assignment is listed only if it passes **the same rules the Onward action enforces**: eligible for the referral's
  product and the item's required level (current, in date, level can approve, user enabled), strictly higher than the
  current assignment, not the caller's own, not the current one. Team membership plays no part.
* Ordered by rank, then name. Nothing is written.
* The Onward action still re-checks everything, so a stale picker can never force a bad routing.

## Referral actions (`slcrm_ExecuteReferralRequestAction`)

Every action requires the caller to be in the Requestor team and to be the referral's **primary underwriter**.

| ActionName | Allowed when | Effect |
|---|---|---|
| `Submit` | Referral is Draft, product set, at least one Draft item, every Draft item complete and its authority eligible | Draft items become Submitted; first-submission flags and timestamps set; status recalculated |
| `SubmitRevisions` | Referral is Revision in Progress; at least one Revision Draft; each has a change summary; authority eligible | Revision Drafts become Resubmitted; status recalculated |
| `CompleteRejected` (Accept Rejection) | Referral is Rejected - UW Action Required; a meaningful, non-whitespace comment (the acknowledgement) | Referral closes as Rejected (inactive); the comment is stored as the outcome summary |
| `CompletePartial` | `slcrm_EnablePartialCompletion` is true (it is, in Dev) **and** referral is Partially Authorised - Action Required | The primary underwriter proceeds with the authorised scope; rejected items stay as evidence; referral closes as Partially Authorised - Completed (inactive) |
| `Cancel` | Referral is still open; non-blank reason | Open items become Cancelled; **items that already have a decision are left exactly as they are, with their decisions**; referral becomes Cancelled / No Longer Required (inactive); explicit-cancel flag set |

## Parent status (aggregation)

After every item action, and after Submit and SubmitRevisions, the referral status and item counts are recalculated
from the **current** items only (`ParentAggregator`, spec 11.6/11.7). First matching rule wins:

1. Explicitly cancelled: **Cancelled**.
2. No items, never submitted, or every item Draft: **Draft**.
3. Any item More Information Needed: **More Information Required**.
4. Any item Revision Draft: **Revision in Progress**.
5. Any item waiting for an approver (Submitted, In Review, Resubmitted, Onward for Approval): if **all** of those are Onward, **Onward for Approval**; otherwise **Sent for Approval**.
6. Otherwise every item is finished. Ignoring cancelled items:
   * no items left: error `SLR-AGG-ALLCANCELLED` (cancel the referral instead of inferring it);
   * authorised and rejected mixed: **Partially Authorised - Action Required**;
   * all rejected: **Rejected - UW Action Required**;
   * all authorised: **Authorised with Conditions**, else **Authorised with Recommendations**, else **Authorised**;
   * anything else: error `SLR-AGG-UNSUPPORTED`.

The five counts written: total, open, authorised, rejected, cancelled (current items). The open count is
`slcrm_opencurrentitemcount` (canonical); the deprecated `slcrm_openitemcount` is kept equal to it. A superseded row is not
current, so it never counts. If every current item is cancelled while the referral is still open, the error is raised
and the status is **not** inferred.

## Authority eligibility (spec 8.4, the part the schema can answer)

An assignment may decide an item only if **all** of these hold: the assignment's product equals the **Referral Request's**
product (the item's own product is informational and never used); its row is Active and its status reason is **Current**; today is on/after Effective From and on/before
Effective To (or there is no end date); its level is Active, **can approve referrals** and has a rank; the level's rank
is sufficient for the item's **required level** (higher number = more authority, confirmed; `slcrm_RankDirection`); the
underwriter is not disabled. A level with a high rank that **cannot approve referrals** is never eligible. Licence scheme, licence location, country and cover are deliberately **not** checked (spec 8.4).

## Consistency strategy

* One transaction per action (Custom API main operation): all writes commit together or not at all.
* Item writes use the row version read at the start (`IfRowVersionMatches`); a concurrent change fails with
  `SLR-CONCURRENCY-412` and rolls the decision back too.
* A retry after success is refused by the state machine (the item is no longer decidable), so a second decision row
  cannot be created. There is no client request id on the deployed APIs (`ItemActionRequest.ClientRequestId` is reserved
  for later). This is **not** full stale-screen detection: a screen that is out of date is only caught by the row-version
  guard on the item write and by the state checks.
* Writes run as the system user; **who the caller is** (`InitiatingUserId`) is checked explicitly in the use case.
