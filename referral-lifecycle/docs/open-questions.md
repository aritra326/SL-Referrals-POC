# Open questions and decisions needed

Nothing here has been guessed into production logic. Each item says what the code does **today** and what decision
unblocks the next step. "PO" means product owner.

## Blocking a feature

| # | Question | What the code does today | Decision / action needed |
|---|---|---|---|
| 1 | **Onward for Approval needs an authority picker.** The Custom API parameter is now fixed (optional Guid `NewAuthorityId` on both APIs, 2026-10-01). | The plug-in accepts the authority and enforces the onward rules (eligible, strictly higher, not yourself, not the same assignment); these are unit-tested. The command bar still opens the existing `slcrm_ReferralLifecycleDialog` custom page for Onward, which appears to be an empty shell. | Build an authority picker for Onward (the decision dialog covers only comment-style actions). Until then Onward can only be called directly, with the authority id. |
| 2 | **Authorise with Conditions.** The spec says "feature-gated, off until confirmed" and the environment has **no Conditions decision type**. | Refused (`SLR-FEATURE-001`; if the switch were on, `SLR-ACTION-UNSUPPORTED`). | PO confirms the feature; then add a "Conditions" choice value to Decision Type and a decision type mapping. |
| 3 | **Complete Partial Outcome.** Spec: needed only if an underwriter may accept a reduced scope without revising rejected items. | Implemented but **off** (`slcrm_EnablePartialCompletion = false`). | PO confirms, then set the variable to `true`. |

## Assumptions the code makes (please confirm)

| # | Rule | Current behaviour | Why it is open |
|---|---|---|---|
| 4 | **Rank direction.** Does a higher comparison rank mean more authority? | Environment variable `slcrm_RankDirection`, deployed as `HigherNumberGreater`. If the variable is missing or invalid every decision fails with `CONFIG-RANK-001`. | Spec 5.2: "an assumption, not a confirmed business rule". Note the seed data: Level C has rank 8 but cannot approve referrals. |
| 5 | **Which item column holds the responsible authority.** The spec names `Selected Underwriting Authority`; the Referral Builder fills in `slcrm_underwriterauthority`, and `slcrm_selectedunderwritingauthority` is empty on every record. | The code uses `slcrm_underwriterauthority` (what the app actually populates). One constant in `Schema.cs`. | Confirm which column is the intended one, and retire the other. |
| 6 | **Product used for eligibility.** | The **referral's** product must equal the authority's product (spec 8.4). The item also has its own product lookup, which is ignored. | Confirm they are always the same. |
| 7 | **Who is "Manager".** The spec says "Primary UW/Manager" may submit, resubmit, revise, cancel and complete. | Only the **primary underwriter** may. A manager who is not the primary underwriter is refused. | Define the manager rule (role, team, hierarchy) before it can be enforced. |
| 8 | **Onward to the same person.** Spec: "not same assignment/user unless PO permits". | Refused for the same assignment **or** the same user as the caller. | PO says whether routing to yourself under a higher assignment is ever allowed. |
| 9 | **Superseded items.** The item status "Superseded" exists, but the spec says the rejected row stays immutable ("Rejected row remains immutable"). | On a revision the rejected row keeps its status "Rejected", is marked **not current**, and gets a Superseded On timestamp. The status "Superseded" is never set. | Confirm whether the old row should show "Superseded". Changing it is one line, but it would also change how counts and reports read. |
| 10 | **Item-level Cancel.** Spec 11.4 defines cancellation only as a referral operation ("Cancel Referral"). | Item-level `Cancel` is refused with a message to cancel the referral. The command bar still has a "Cancel Item" button. | Confirm whether a single item can be cancelled; remove the button if not. |
| 11 | **Accept Rejection acknowledgement.** Spec has an `Acknowledgement` parameter; the deployed API only has `Comment`. | A non-blank comment is required and stored as the outcome summary. | Confirm that is an acceptable acknowledgement, or add a parameter. |
| 12 | **Referral cancel after a decision.** Spec: "final items remain evidence if policy disallows cancellation after decision (TBC)". | Open items are cancelled; items that already have an outcome are kept. | Confirm the policy. |
| 13 | **All items cancelled but referral not cancelled.** | Error `SLR-AGG-ALLCANCELLED` (the spec says to repair it by cancelling the referral, not to infer it). | None; documented for support staff. |

## Not implemented because the schema or spec cannot support it yet

| # | Gap | Impact |
|---|---|---|
| 14 | **Snapshot-integrity checks** from spec 8.4 (`AuthorityRankSnapshot`, `CanApproveReferralsSnapshot`, `SnapshotIntegrity`). The columns do not exist on Underwriting Authority. | Eligibility reads the live level instead. Safe, but a level change is picked up immediately rather than being compared with a snapshot. |
| 15 | **Reason-specific template fields** at submit. The required fields per referral reason are not defined in the repository. | Submit checks only the common fields: reason, cover, summary, details, rationale, required level, authority, approver. |
| 16 | **Client request id / idempotency and ExpectedRowVersion** parameters from the spec. The deployed APIs have neither. | A retry is stopped by the state machine; concurrent edits are caught with the row version the plug-in reads itself. A stale browser screen cannot be detected. |
| 17 | **Notification outbox** (`slcrm_referralnotification`) rows. Spec says "Notification: Yes". | No rows are written; nothing for a delivery flow to pick up. Out of scope of this brief. |
| 18 | **Decision immutability guard.** The spec adds Pre-Update/Delete plug-ins that block edits to decisions. | Not built. Mitigation: do not give users Create/Write/Delete on Referral Decision in security roles. |
| 19 | **Recommendations column is 100 characters** on the decision table. | Full text is kept in Decision Comments; the 100-character column holds a shortened copy. Consider widening it or making it a memo. |
| 20 | **Count columns.** Both `slcrm_openitemcount` and `slcrm_opencurrentitemcount` exist. | Both are written with the same value. Confirm which one to keep. |
| 21 | **Copy of the spec is not in the repository.** `original-spec.txt` is git-ignored. | Rule sources in these docs cite its section numbers; keep a copy somewhere the team can read. |
