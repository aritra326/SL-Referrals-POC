# Confirmed POC decisions

Recorded 2026-10-01 from the product-owner decisions for the Referral & Rationale POC/demo. They unblock implementation.
Where a decision says so, the behaviour stays **configurable** so the production security and underwriting-authority
model can replace the POC behaviour later. A decision here wins over the specification text
([specification/](specification/README.md)).

How to read the table: *Where* is the code or configuration that implements it; *Tests* are in `tests/` (.NET) or
`src/Referral.Dialog/tests` (dialog).

| # | Decision | Where it is implemented | Tests |
|---|---|---|---|
| 1 | **Onward picker: implemented.** The approver picks an **Underwriting Authority assignment** (never just a user or a level). The picker shows approver, level, comparison rank, licence/scheme and product. `NewAuthorityId` carries the assignment id. The server re-validates everything: current, eligible, can approve, product, strictly higher, not the same assignment, not the caller's. | `slcrm_GetEligibleAuthorities` (`EligibleAuthorityService`, `EligibleAuthoritiesPlugin`); dialog picker table; Onward in `ItemActionService` | `EligibleAuthorityServiceTests`, `PocDecisionsTests`, `OnwardDialog.test.tsx`, `PocDialog.test.tsx` |
| 2 | **Authorise with Conditions: not enabled.** Gate stays off; no Conditions decision type is created. Authorised and Authorised with Recommendations are supported. | `slcrm_EnableConditionalDecision = false`; `ItemActionService` | `AuthoriseWithConditions_*` |
| 3 | **Complete Partial Outcome: enabled.** The primary underwriter may proceed with only the authorised scope; rejected items stay as evidence; the referral becomes Partially Authorised - Completed. | `slcrm_EnablePartialCompletion = true` (current value); `ParentActionService.CompletePartial` | `CompletePartial_*`, `PartialCompletion_IsAvailableWhenTheSettingIsOn` |
| 4 | **Rank direction confirmed:** higher number = more authority. **Can Approve Referrals is independent:** rank 8 that cannot approve is not eligible. | `slcrm_RankDirection = HigherNumberGreater`; `AuthorityEligibilityRules` | `RankAndCanApproveTests`, `AuthorityEligibilityRulesTests` |
| 5 | **Canonical authority column** is `slcrm_underwriterauthority`. `slcrm_selectedunderwritingauthority` is deprecated and unused (not deleted). | `Schema.Item.AuthorityAssignment`, `Schema.Item.DeprecatedSelectedAuthority` (documented) | `TheCanonicalAuthorityColumn_*` |
| 6 | **The Referral Request's product is the only product used for eligibility.** The item product is informational. No hidden fallback. | `AuthorityChecker`, `EligibleAuthorityService`; `Schema.Item.InformationalProduct` | `ApproverEligibility_UsesTheReferralProduct`, `Authorise_WhenTheAuthorityIsForADifferentProduct_*` |
| 7 | **No Manager concept.** Two Owner teams, `SL Referral Requestors` and `SL Referral Approvers`, give the **action role**. Requestor actions still require the referral's Primary Underwriter. Team membership is never proof of authority. | `ActionRoleRules`, `ActionRoleChecker` (server), demo layer in `slcrm_ReferralCommands.js` (UI), `slcrm_EnforceTeamRoles` | `TeamRoleTests`, `ActionRoleRulesTests`, `commands.test.ts` |
| 8 | **Onward to yourself is not allowed**: not the same assignment, and not any assignment of the caller, even at a higher rank. | `RequireValidOnwardDestination`; picker excludes them | `Onward_ToTheSamePerson_*`, `TheCallersOwnOtherAssignments_*` |
| 9 | **A revised rejected item becomes `Superseded`**: immutable, `IsCurrent = false`, `SupersededOn` set, status Superseded. Its rejection stays in Referral Decision history. | `ReferralRepository.CreateRevision` | `RevisionSupersedeTests`, `CreateRevision_MarksTheRejectedRowSuperseded_*` |
| 10 | **No item-level Cancel.** The "Cancel Item" command is hidden; the shared handler refuses on an item. Cancel Referral stays. | app action `Cancelitem` hidden; `cancelItem` guard; `ActionRoleRules` | `item-level cancel is not supported` (jest), `ItemLevelCancel_*` |
| 11 | **Accept Rejection:** a non-blank comment is the acknowledgement, stored as the outcome summary. No new API parameter. Wording: "Please confirm your acceptance of the rejected outcome and provide a comment." | `ActionInputRules`, `dialogActions.ts` | `AcceptingARejection_NeedsAMeaningfulComment`, `PocDialog.test.tsx` |
| 12 | **Cancelling after decisions is allowed.** Open items are cancelled; decided items and their decisions are untouched; the referral becomes Cancelled / No Longer Required. | `ParentActionService.Cancel` | `CancellingAfterSomeItemsAreDecided_*` |
| 13 | **`SLR-AGG-ALLCANCELLED` stays.** No automatic inference of a parent cancel. | `ParentAggregator` | `IfEveryItemIsCancelled...`, `EveryItemCancelledButReferralNotCancelled_*` |
| 14 | **Minimum decision snapshots:** authority assignment id, **authority level id**, level name, **comparison rank**, **can-approve flag**, deciding user, decision time. Stored on the decision, so later changes to the live level cannot rewrite history. New columns on Referral Decision: `slcrm_authoritylevelused` (lookup, restrict delete) and `slcrm_canapprovereferralssnapshot`. | `NewDecision`, `ReferralRepository.CreateDecision`, `Schema.Decision` | `DecisionSnapshotTests`, `CreateDecision_WritesRecommendationsInFullAndTheAuthoritySnapshot` |
| 15 | **No reason-specific submit validation yet.** Submit checks the common fields only, through a seam (`ISubmitRule` / `SubmitValidator`) so reason rules can be added without rewriting Submit. | `SubmitRules.cs`, `ParentActionService` | `SubmitRuleSeamTests` |
| 16 | **No `ClientRequestId` / `ExpectedRowVersion` on the APIs.** State-machine checks and the row-version guard stay. This is **not** full stale-screen detection. `ItemActionRequest.ClientRequestId` is reserved for later. | `ItemActionRequest`, `ReferralRepository.UpdateIfUnchanged` | `Authorise_WhenTheItemRowChangedSinceItWasRead_*` |
| 17 | **No notification delivery.** Lifecycle code never sends email. A future outbox (`slcrm_referralnotification`) with Power Automate is the intended pattern. No rows are written. | none (deliberately) | n/a |
| 18 | **Decision immutability enforced server-side.** Pre-Update on the evidence columns and Pre-Delete are refused. The only exception is the explicit `slcrm_AllowDecisionMaintenance` setting (off). Security roles should also drop Write/Delete (defence in depth; a task for an administrator, see [demo-authorization.md](demo-authorization.md)). | `DecisionImmutability`, `ReferralDecisionGuardPlugin`, two registered steps | `DecisionImmutabilityTests`, `DecisionGuardTests` |
| 19 | **Recommendations is now multiline (4000 characters).** Converted in place from the 100-character column. Longer text is refused with a clear message, never shortened. Decision Comments stays separate. | column format TextArea; `ActionInputRules.MaxRecommendationsLength` | `RecommendationLengthTests`, `PocDialog.test.tsx` |
| 20 | **`slcrm_opencurrentitemcount` is the canonical open count.** The older `slcrm_openitemcount` is deprecated; it is still written with the same value for compatibility. | `Schema.Parent.OpenItemCount` / `OpenItemCountLegacy` | `TheCanonicalOpenCount_IsWritten_*` |
| 21 | **The specification is version-controlled** in `docs/specification/`; business-rule decisions are recorded here. | `docs/specification/` | n/a |

## Team and command model for the demo

```
Team membership          -> the action role: who may START which command (UI and server)
Underwriting Authority   -> business eligibility: may this person decide THIS item
Custom API / plug-in     -> authoritative enforcement of both, plus state and ownership rules
```

* Requestor commands: New Referral, Submit, Resubmit, Revise, Cancel Referral, Accept Rejection, Complete Partial Outcome.
* Approver commands: Start Review, Authorise, Authorise with Recommendations, Reject, More Information Required, Onward for Approval.
* A user may be in both teams for the demo. Server-side state and authority validation always win over what the command bar shows.
