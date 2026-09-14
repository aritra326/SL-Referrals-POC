# SLCRM.ReferralLifecycle — plug-in project

Implements the two deployed Custom APIs' server-side logic:

- `slcrm_ExecuteReferralItemAction` (bound to `slcrm_referralitem`)
- `slcrm_ExecuteReferralRequestAction` (bound to `slcrm_referralrequest`)

Both already exist in the environment with the request/response contract:

| Parameter | Type | Notes |
|---|---|---|
| `Target` | EntityReference (bound) | the Referral Item / Referral Request |
| `ActionName` | String, required | see the action names below |
| `Comment` | String, optional | rationale/instruction text |
| `NewAuthorityId` | Guid, optional | only used by the `Onward` action |
| → `ResultRecordId` | Guid (response) | the affected record, or a new revision's id for `CreateRevision` |

The JS command bar buttons (`slcrm_ReferralCommands.js`, already deployed) call these with the
action names below — the C# `switch` in `ReferralLifecycleService` implements every one of them:

- **Referral Item**: `StartReview`, `RequestInformation`, `Resubmit`, `Onward`, `Authorise`,
  `AuthoriseWithRecommendations`, `AuthoriseWithConditions`, `Reject`, `CreateRevision`, `Cancel`
- **Referral Request**: `Submit`, `SubmitRevisions`, `CompletePartial`, `CompleteRejected`, `Cancel`

## What's implemented

- Status-reason transitions for every action above, resolved **by label** (never a hardcoded
  option value — those are assigned per environment).
- `slcrm_referraldecision` row creation for every decision-type Referral Item action.
- Referral Item revision creation (`CreateRevision`) that supersedes the rejected row and copies
  the business/reason fields forward.
- Parent (`slcrm_referralrequest`) status recalculation after every item-level and request-level
  action, implementing the aggregation truth table from the implementation spec §11.6/11.7
  (Draft → Sent for Approval → Onward for Approval / More Information Required / Revision in
  Progress → the four terminal outcomes), plus the open/authorised/rejected/cancelled item counts.

## Explicitly NOT implemented yet (next pass)

- **Eligibility validation** — the `Onward` action accepts any `NewAuthorityId` without checking
  it is a strictly-higher eligible Underwriting Authority for the item's product/rank. Marked
  `TODO(eligibility)` in `ReferralLifecycleService.ExecuteItemAction`.
- **Caller/approver authorisation checks** — actions currently run as whoever calls the API; there
  is no check that the caller is the assigned approver (for decision actions) or the primary
  underwriter/manager (for submit/cancel/revision actions).
- **Notification outbox** — no `slcrm_referralnotification` rows are created, so the Power Automate
  delivery flow (if/when built) has nothing to pick up yet.
- **Optimistic concurrency** — the deployed Custom API contract has no `ExpectedRowVersion`
  parameter, so none is checked. Add one to the Custom API's request parameters first if this
  matters for the POC.

## Build & register (Visual Studio 2022)

1. Open `SLCRM.ReferralLifecycle.csproj` in Visual Studio 2022.
2. NuGet restore will pull `Microsoft.CrmSdk.CoreAssemblies` — confirm/pin the version in the
   `.csproj` to whatever your other plugin projects use (the version pinned here is a placeholder).
3. Generate a strong-name key and update the project:
   ```powershell
   sn -k SLCRM.ReferralLifecycle.snk
   ```
   Place the `.snk` next to the `.csproj` (already referenced by `AssemblyOriginatorKeyFile`).
4. Build in Release configuration.
5. Register with the **Plugin Registration Tool** (or `pac plugin push`, solution-aware):
   - Register the assembly `SLCRM.ReferralLifecycle.dll` into the `SL_Referrals` solution.
   - Register **two steps**, both **Synchronous**, stage **Main Operation (30)**:
     - `ReferralItemActionPlugin` → Message `slcrm_ExecuteReferralItemAction`,
       Primary Entity `slcrm_referralitem`
     - `ReferralRequestActionPlugin` → Message `slcrm_ExecuteReferralRequestAction`,
       Primary Entity `slcrm_referralrequest`
6. Publish all customizations.
7. Test: open a Referral Item, use a command-bar button (e.g. **Reject**) — it currently opens a
   plain browser prompt via the deployed `slcrm_ReferralCommands.js` `execute()` path once wired,
   or invoke the API directly from the browser console for a first smoke test:
   ```js
   Xrm.WebApi.online.execute({
     Target: { entityType: "slcrm_referralitem", id: "<item-guid>" },
     ActionName: "Reject",
     Comment: "test",
     getMetadata: function () {
       return {
         boundParameter: "Target",
         parameterTypes: {
           Target: { typeName: "mscrm.slcrm_referralitem", structuralProperty: 5 },
           ActionName: { typeName: "Edm.String", structuralProperty: 1 },
           Comment: { typeName: "Edm.String", structuralProperty: 1 }
         },
         operationType: 0,
         operationName: "slcrm_ExecuteReferralItemAction"
       };
     }
   });
   ```
