# Plug-in registration

## Assembly

| Setting | Value |
|---|---|
| Assembly name | `SLCRM.ReferralLifecycle` (one merged, strong-named DLL built by `scripts/Build-PluginAssembly.ps1`) |
| Target framework | .NET Framework 4.6.2 |
| Isolation | Sandbox |
| Source | Database |
| Solution | `SL_Referrals` (publisher SL CRM, prefix `slcrm_`) |

## Plug-in types

| Type | Purpose |
|---|---|
| `Referral.Plugins.ReferralItemActionPlugin` | Main operation of `slcrm_ExecuteReferralItemAction` |
| `Referral.Plugins.ReferralRequestActionPlugin` | Main operation of `slcrm_ExecuteReferralRequestAction` |

## How they are attached: Custom API binding, not message steps

These are **Custom API main-operation plug-ins**. Each Custom API record has a `plugintypeid` column; setting it to the
type above makes Dataverse run that type as the API's main operation. **No `sdkmessageprocessingstep` is created and
no images are used**, so there is nothing to register in the Plug-in Registration Tool beyond the assembly.

| Custom API | `plugintypeid` set to | Stage | Mode | Filtering attributes | Images |
|---|---|---|---|---|---|
| `slcrm_ExecuteReferralItemAction` | `ReferralItemActionPlugin` | Main Operation (30) | Synchronous | n/a | none |
| `slcrm_ExecuteReferralRequestAction` | `ReferralRequestActionPlugin` | Main Operation (30) | Synchronous | n/a | none |

Why no images: the plug-in needs the *current* row, which it reads itself with a minimal column list, together with
the row version used for the concurrency check. A pre-image could be stale by the time the user clicks.

Guards in the code (`LifecyclePluginBase`):

* Message name must match the plug-in, otherwise a clear registration error.
* Stage must be 30.
* `Depth` greater than 3 is refused (recursion guard). The plug-in's own writes never re-enter these APIs.
* The target must be the expected table; `ActionName` must be present.

## Security

* Writes use the **system user** (`CreateOrganizationService(null)`), because ordinary security roles should not be
  allowed to create decision rows directly.
* The caller (`InitiatingUserId`) is checked inside the use case: approver actions require the item's assigned
  approver; referral actions and resubmits require the referral's primary underwriter.
* Roles should **not** grant Create/Write/Delete on Referral Decision to normal users (history must stay immutable).
  This is a role-configuration task, not enforced by code (see open questions).

## Trace logging

Messages written with `ITracingService` contain ids, action names, status names and error codes only. They never
contain comment text or other free-text narrative. Unexpected errors write the full exception to the trace and show
the user a generic message with the correlation id.
