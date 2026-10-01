# Open questions

Last updated 2026-10-01 after the product-owner decisions. Nothing here is guessed into production logic.
The three sections say what has been **decided**, what is **deferred to production design**, and what is genuinely **still open**.

## 1. Confirmed POC decisions (no longer open)

These were open questions and have been decided. The full record, with where each is implemented and tested, is in
[decisions.md](decisions.md).

| Was open | Decision |
|---|---|
| Onward needs an authority picker | Implemented: picks an Underwriting Authority assignment; server re-validates (decision 1) |
| Authorise with Conditions | Not enabled for the POC; no Conditions decision type (2) |
| Complete Partial Outcome | Enabled (3) |
| Rank direction | Higher number = more authority; Can Approve is independent (4) |
| Which authority column | `slcrm_underwriterauthority`; the other is deprecated (5) |
| Product used for eligibility | The Referral Request's product only (6) |
| Who is a Manager | No Manager in the POC; two teams give the action role (7) |
| Onward to yourself | Not allowed (8) |
| Superseded items | The revised rejected item becomes Superseded (9) |
| Item-level Cancel | Not supported; command hidden (10) |
| Accept Rejection acknowledgement | A non-blank comment is enough (11) |
| Referral cancel after decisions | Allowed; decided items untouched (12) |
| All items cancelled, referral open | Keep `SLR-AGG-ALLCANCELLED` (13) |
| Snapshot integrity | Minimum decision snapshots implemented (14) |
| Reason-specific template fields | Not implemented; seam added (15) |
| Idempotency / ExpectedRowVersion | Not added to the APIs (16) |
| Notification outbox | Not implemented (17) |
| Decision immutability guard | Implemented (18) |
| Recommendations 100-character column | Now multiline, 4000 characters (19) |
| Two open-count columns | `slcrm_opencurrentitemcount` is canonical (20) |
| Where the spec lives | `docs/specification/` (21) |

## 2. Deferred for production design

Not needed for the POC. Each has a defined interim behaviour so nothing is guessed.

| Topic | POC behaviour | Needs deciding for production |
|---|---|---|
| **Production access model** (business units, teams, security roles, any "Manager") | Two demo teams give an action role; the server also checks it; Primary Underwriter and Assigned Approver rules stay | The real BU/team/role model; whether a Manager exists and how it is derived. See [demo-authorization.md](demo-authorization.md) for how to replace the demo layer |
| **Authorise with Conditions** | Off; refused with `SLR-FEATURE-001` | Who satisfies a condition, whether the referral stays open, whether quoting/binding may continue, whether re-approval is needed, who confirms satisfaction; then add the decision type |
| **Reason-specific required fields** at submit | Common fields only, through `ISubmitRule` | The required fields per referral reason |
| **Explicit idempotency and stale-screen detection** | State-machine checks plus a row-version guard on item writes (not full stale-screen detection) | Add `ClientRequestId` / `ExpectedRowVersion` to the Custom APIs |
| **Notifications** (outbox and delivery) | None; lifecycle code never sends email | Outbox rows in `slcrm_referralnotification` and a Power Automate delivery flow |
| **Multi-product referrals** | One product per referral; the item product is informational | Revisit the eligibility model if a referral may span products |
| **Cover and other eligibility dimensions** (cover/section, licence scheme and location, country) | Eligibility uses product, status, dates, level, rank and Can Approve only (spec 8.4). Licence scheme is displayed in the picker, not enforced | Which of these dimensions become real rules |
| **Authority-table snapshot columns** (spec 8.4 snapshot integrity) | Not present on Underwriting Authority; eligibility reads the live level. **Decisions** store their own snapshot (decision 14) | Whether the authority table also needs snapshot columns |
| **Retiring duplicate columns** | `slcrm_selectedunderwritingauthority` and `slcrm_openitemcount` kept, marked deprecated | Dependency analysis of forms, views and code, then removal |
| **Command visibility** | Buttons stay visible; a click by the wrong team gets a clear message (UI) and is refused (server) | Hide buttons by team with Command Designer visibility formulas |

## 3. Still open (needs an answer or an action)

| # | Item | Why it matters | Owner |
|---|---|---|---|
| 1 | **Create the two Owner teams** `SL Referral Requestors` and `SL Referral Approvers` and add test users | Until they exist the team rule is not enforced (nobody is locked out). This is a security change, so it is for an administrator. Steps: [demo-authorization.md](demo-authorization.md) | Administrator |
| 2 | **Remove Write and Delete on Referral Decision** from security roles | Defence in depth for decision immutability. The plug-in already refuses, but roles should agree | Administrator |
| 3 | **"Authorise with Conditions" button is still visible** and always refuses | Decision 2 keeps the feature off but does not say whether to hide the button. Same reasoning as the hidden Cancel Item button | Product owner |
| 4 | **Which command opens the Referral Builder ("Create Referral")?** | The demo layer gates the commands in `slcrm_ReferralCommands.js`; the Builder entry point is not one of them, so Create Referral is not yet limited to Requestors | Product owner / developer |
| 5 | **Is 4000 characters enough for Recommendations?** | It is the largest a multiline text column allows when converted in place. A separate memo column would allow more | Product owner |
| 6 | **Clean-up of the `SMOKE-REF-*` test referrals** | Decision immutability now blocks deleting their decision rows. Deleting them needs `slcrm_AllowDecisionMaintenance = true` for the duration, then back to false | Administrator |
| 7 | **Classic ribbon "Cancel Item"** | The modern app action is hidden. The older classic-ribbon definition for the same button is still in the solution; confirm it does not appear in the app | Developer |
| 8 | **Second-user checks** | Wrong-caller refusal, expired authority, missing rank setting and concurrent edits are unit-tested but not yet run in the environment (only one interactive test user exists). See [integration-test-plan.md](integration-test-plan.md) | Developer with a second test user |
