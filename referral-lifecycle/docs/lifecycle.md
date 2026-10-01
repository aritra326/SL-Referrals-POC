# Lifecycle: what the plug-in enforces

Source: spec section 11 (kept locally as `sl-referrals-app/original-spec.txt`; it is not committed). Every rule below
is implemented and unit-tested. Rules the spec marks as unconfirmed are **not** here; they are in
[open-questions.md](open-questions.md).

All commands run **server-side** inside the Custom API's main-operation plug-in, in one Dataverse transaction: if any
check or write fails, every write made so far is rolled back. The dialog and command bar are conveniences only.

| Operation | Plug-in class | Use case |
|---|---|---|
| Any action on a Referral Item | `ReferralItemActionPlugin` | `ItemActionService` |
| Any action on a Referral Request | `ReferralRequestActionPlugin` | `ParentActionService` |

## Item actions (`slcrm_ExecuteReferralItemAction`)

Common checks, in this order: the item is the **current revision**, the referral is **still open**, the action is
**allowed from the item's status**, the **caller** is allowed, then input and authority checks.

| ActionName | Allowed from | Leads to | Who may run it | Extra rules | Decision row |
|---|---|---|---|---|---|
| `StartReview` | Submitted, Resubmitted, Onward for Approval | In Review | Assigned approver | Authority eligible | No |
| `Authorise` | Submitted, In Review, Resubmitted, Onward for Approval | Authorised | Assigned approver | Authority eligible. Comment optional. | Authorised |
| `AuthoriseWithRecommendations` | same | Authorised with Recommendations | Assigned approver | Recommendations (comment) required | Authorised With Recommendation |
| `RequestInformation` | same | More Information Needed | Assigned approver | Information text (comment) required | More Information Needed |
| `Reject` | same | Rejected | Assigned approver | Reason (comment) required | Rejected |
| `Onward` | same | Onward for Approval | Assigned approver | Comment required; destination eligible, **strictly higher** rank, not yourself, not the same assignment. Moves the item to the new authority and approver. | Onward for Approval |
| `Resubmit` | More Information Needed, Revision Draft | Resubmitted | Primary underwriter | Information response (or change summary for a revision) not blank; authority re-checked | No |
| `CreateRevision` | Rejected | **New** item in Revision Draft; the rejected row stops being current and keeps its status | Primary underwriter | Referral is Rejected - UW Action Required or Partially Authorised - Action Required; no revision exists yet | No |
| `AuthoriseWithConditions` | n/a | **Refused** | n/a | Switch off by default **and** no matching decision type exists | n/a |
| `Cancel` | n/a | **Refused** with a message to cancel the referral | n/a | Not a confirmed item command | n/a |

Every decision gets the next **sequence number** for the item and snapshots of the authority level and rank used.
Decisions are only ever created, never edited or deleted.

## Referral actions (`slcrm_ExecuteReferralRequestAction`)

Every action requires the caller to be the referral's **primary underwriter**.

| ActionName | Allowed when | Effect |
|---|---|---|
| `Submit` | Referral is Draft, product set, at least one Draft item, every Draft item complete and its authority eligible | Draft items become Submitted; first-submission flags and timestamps set; status recalculated |
| `SubmitRevisions` | Referral is Revision in Progress; at least one Revision Draft; each has a change summary; authority eligible | Revision Drafts become Resubmitted; status recalculated |
| `CompleteRejected` | Referral is Rejected - UW Action Required; a non-blank acknowledgement (comment) | Referral closes as Rejected (inactive) |
| `CompletePartial` | `slcrm_EnablePartialCompletion` is true **and** referral is Partially Authorised - Action Required | Referral closes as Partially Authorised - Completed (inactive) |
| `Cancel` | Referral is still open; non-blank reason | Open items become Cancelled; items with an outcome are kept; referral becomes Cancelled (inactive); explicit-cancel flag set |

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

The five counts written: total, open, authorised, rejected, cancelled (current items).

## Authority eligibility (spec 8.4, the part the schema can answer)

An assignment may decide an item only if **all** of these hold: the assignment's product equals the **referral's**
product; its row is Active and its status reason is **Current**; today is on/after Effective From and on/before
Effective To (or there is no end date); its level is Active, **can approve referrals** and has a rank; the level's rank
is sufficient for the item's **required level** (direction from `slcrm_RankDirection`); the underwriter is not
disabled. Licence scheme, licence location, country and cover are deliberately **not** checked (spec 8.4).

## Consistency strategy

* One transaction per action (Custom API main operation): all writes commit together or not at all.
* Item writes use the row version read at the start (`IfRowVersionMatches`); a concurrent change fails with
  `SLR-CONCURRENCY-412` and rolls the decision back too.
* A retry after success is refused by the state machine (the item is no longer decidable), so a second decision row
  cannot be created. There is no client request id on the deployed API.
* Writes run as the system user; **who the caller is** (`InitiatingUserId`) is checked explicitly in the use case.
