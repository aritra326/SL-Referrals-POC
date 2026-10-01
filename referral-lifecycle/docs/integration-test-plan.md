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
