# Integration test plan

The automated tests use fakes and mocks. They prove the rules, the orchestration, the label mapping and the plug-in
entry-point behaviour. They **cannot** prove what happens inside Dataverse, so the checks below must be run in a
trial environment with **test records only** (names starting `SMOKE-`). Never decide on real referrals.

## What is and is not covered by automated tests

| Behaviour | Covered by | Real Dataverse needed? |
|---|---|---|
| Transition matrix, aggregation truth table, authority predicate, input rules | `Referral.Domain.Tests` | No |
| Orchestration, who may do what, rollback-by-validation-order, sequence numbers | `Referral.Application.Tests` (in-memory repository) | No |
| Label to option-value mapping, settings, column lists, row-version call | `Referral.Dataverse.Tests` (mocked `IOrganizationService`) | **Yes, for the real column behaviour** |
| Registration checks, input parsing, error translation | `Referral.Plugins.Tests` (mocked context) | **Yes, for the real pipeline** |
| Dialog behaviour | `src/Referral.Dialog/tests` (jest, jsdom, fake fetch) | **Yes, for the real dialog window** |

## Checks to run in the environment

Set up: one test Referral Request with a primary underwriter (user A), product P, and two Draft items, each with a
current authority assignment for P at the required level whose underwriter is the assigned approver (user B).

1. **Submit** as user A: both items become Submitted, referral becomes Sent for Approval, counts are 2 total / 2 open.
2. **Wrong caller:** Authorise as user A (not the approver): refused with `SLR-AUTH-403`, no decision row.
3. **Authorise** as user B on item 1: item Authorised, one decision row (sequence 1, type Authorised, snapshots filled),
   referral still Sent for Approval.
4. **Reject** as user B on item 2 with a reason: item Rejected, decision row has the reason; referral becomes
   Partially Authorised - Action Required.
5. **Repeat** step 3: refused (`SLR-STATUS-409`), still exactly one decision for item 1.
6. **Concurrency:** open the same Submitted item in two sessions as user B, authorise in one, then in the other.
   The second is refused and creates no decision.
7. **Expired authority:** set the assignment's Effective To to yesterday; Authorise is refused with `SLR-AUTH-EXPIRED`.
8. **Revision:** as user A, `CreateRevision` on the Rejected item: new Revision Draft, old row not current, referral
   Revision in Progress. A second `CreateRevision` is refused (`SLR-REVISION-EXISTS`).
9. **Cancel** as user A with a reason: open items Cancelled, authorised item kept, referral Cancelled and inactive.
10. **Settings:** delete the `slcrm_RankDirection` current value and default; Authorise fails with `CONFIG-RANK-001`.
    Restore it afterwards.
11. **Dialog:** from the Referral Item form, click Authorise and Reject; confirm the dialog opens, Reject refuses an
    empty reason, success closes the dialog and the form shows the new status.
12. **Status values:** confirm the item and referral rows show the expected status reason labels after each step
    (this is what proves the label mapping against the real option sets).

Record the results, the test record ids and the correlation id of any failure in the deployment report.

## Added with the confirmed POC decisions

Run these with `SMOKE-` records too. Items marked (teams) need the two teams to exist and a test user in each; see
[demo-authorization.md](demo-authorization.md).

13. **Superseded:** reject an item, then Create Revision. The old row shows **Superseded**, is not current, has Superseded On set,
    and its decision row still says Rejected. The new row is a Revision Draft.
14. **Snapshots:** after any decision, the Referral Decision row has the authority assignment, **Authority Level Used**, level
    name, rank, **Can Approve Referrals (snapshot)**, deciding user and decision time. Rename the level or change its rank
    afterwards; the decision does not change.
15. **Immutability:** try to edit an evidence column of a decision and to delete it (Web API or a form). Both are refused with
    `SLR-DECISION-IMMUTABLE`. Creating decisions still works.
16. **Recommendations:** Authorise with Recommendations with about 2000 characters. The full text is on the decision.
    4001 characters is refused with a clear message.
17. **Partial outcome:** with one authorised and one rejected item, Complete Partial Outcome closes the referral as Partially
    Authorised - Completed; the rejected item keeps its status and decision.
18. **Conditions:** Authorise with Conditions is refused (`SLR-FEATURE-001`).
19. **Picker:** on an item awaiting approval, Onward for Approval shows a table of approver, level, rank, licence/scheme and
    product. It lists only eligible, strictly higher assignments of other users. Choosing one and confirming routes the item;
    the item shows the new approver.
20. **Cancel Item:** the button is not shown on the Referral Item form.
21. (teams) A user only in **SL Referral Requestors** is refused Authorise (`SLR-ROLE-403`); a user only in
    **SL Referral Approvers** is refused Submit and Cancel Referral; a user in both can do both; being in the Approver team
    does not let a user decide an item they are not the assigned approver of.
