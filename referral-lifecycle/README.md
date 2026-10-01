# Referral lifecycle (server-side rules, plug-ins and decision dialog)

Implements the Referral Request / Referral Item lifecycle for the **SL Referrals** model-driven app:
authorise, reject, request information, onward, resubmit, revise, submit, complete and cancel, with a permanent
decision history and authority checks. Business rules run **on the server** in Dataverse; the dialog and the command
bar only collect input.

Start with these documents:

| Document | What it is |
|---|---|
| [docs/decisions.md](docs/decisions.md) | The 21 confirmed POC decisions, where each is implemented and tested |
| [docs/specification/README.md](docs/specification/README.md) | The version-controlled specification and an index of its sections |
| [docs/lifecycle.md](docs/lifecycle.md) | Exactly which transitions are enforced, by whom, and which operation performs them |
| [docs/schema-map.md](docs/schema-map.md) | Tables, columns, status labels and option values found in the environment |
| [docs/plugin-registration.md](docs/plugin-registration.md) | How the plug-ins are attached (Custom API main operation, no message steps) |
| [docs/demo-authorization.md](docs/demo-authorization.md) | The temporary team-based layer that decides who may start each command, and how to set up the two teams |
| [docs/open-questions.md](docs/open-questions.md) | Rules still waiting for a product-owner decision, and what the code does meanwhile |
| [docs/integration-test-plan.md](docs/integration-test-plan.md) | What the unit tests cannot prove and how to check it in the environment |
| [docs/deployment-report.md](docs/deployment-report.md) | What was deployed, where, and the smoke-test result |

## Layout

```
referral-lifecycle/
  ReferralLifecycle.sln          open this in Visual Studio 2022
  global.json                    pins .NET SDK 9.0.x for command-line builds
  src/
    Referral.Domain/             pure rules: statuses, transitions, aggregation, authority predicate. No Dataverse.
    Referral.Application/        use cases (ItemActionService, ParentActionService) behind small interfaces
    Referral.Dataverse/          the only code that knows column names and talks to Dataverse
    Referral.Plugins/            thin IPlugin entry points (assembly name SLCRM.ReferralLifecycle)
    Referral.Dialog/             decision dialog (React web resource) and the command-bar script
  tests/                         one test project per layer
  docs/  scripts/
```

How the layers depend on each other (arrows point at what is used):

```
Plugins -> Dataverse -> Application -> Domain
   \____________________^
```

A rule lives in exactly one place. If you need to change *when something is allowed*, it is in `Referral.Domain` or
`Referral.Application`. If a Dataverse *name* changed, it is `Referral.Dataverse/Schema.cs` or `OptionLabels.cs`.
`Referral.Plugins` should almost never need to change.

## What you need

* **Visual Studio 2022** with the **.NET desktop development** workload and the **.NET Framework 4.6.2 targeting pack**
  (Individual components). The plug-in assembly targets **.NET Framework 4.6.2**, which is what Dataverse requires.
* **.NET SDK 9.0.x** for command-line builds (`dotnet --list-sdks` must show 9.0.x; `global.json` pins it).
* **Node.js 18+** for the dialog (`src/Referral.Dialog`).
* **Power Platform CLI** (`pac`) signed in to the target environment, for export and import.
* Windows PowerShell 5.1 (the scripts use .NET Framework cryptography).

The projects use `Microsoft.NETFramework.ReferenceAssemblies`, so the command line builds .NET Framework 4.6.2 even
without the targeting pack; Visual Studio 2022 simply uses its own.

## Build and test

```powershell
cd referral-lifecycle
dotnet build ReferralLifecycle.sln -c Release
dotnet test  ReferralLifecycle.sln -c Release       # Domain, Application, Dataverse and Plugin tests
```

In Visual Studio: open `ReferralLifecycle.sln`, **Build > Build Solution**, then **Test > Run All Tests**.

Dialog:

```powershell
cd src\Referral.Dialog
npm install
npm test            # jest
npm run build       # writes dist\slcrm_referraldecision.js and .html
```

## Package

```powershell
.\scripts\New-StrongNameKey.ps1        # once per machine; keep the .snk safe and reuse it (it is git-ignored)
.\scripts\Build-PluginAssembly.ps1     # builds, tests, merges the four DLLs into out\SLCRM.ReferralLifecycle.dll, signs it
```

Dataverse loads one assembly, so the script merges Domain, Application, Dataverse and Plugins with ILRepack.
Microsoft.Xrm.Sdk is not merged because Dataverse provides it.

## Deploy (trial environment only)

1. `pac org who` and confirm the environment is the intended **trial** environment.
2. **Export a recoverable copy first** (both package types), commit it:
   ```powershell
   pac solution export --name SL_Referrals --path solution-export\SL_Referrals_<version>.zip --overwrite
   pac solution export --name SL_Referrals --path solution-export\SL_Referrals_<version>_managed.zip --managed --overwrite
   ```
3. Register `out\SLCRM.ReferralLifecycle.dll` into the **SL_Referrals** solution (sandbox, database) and bind the two
   plug-in types to the two Custom APIs. Steps and the exact settings are in
   [docs/plugin-registration.md](docs/plugin-registration.md).
4. Create the three environment variables (`slcrm_RankDirection`, `slcrm_EnableConditionalDecision`,
   `slcrm_EnablePartialCompletion`) in the solution. Values are in [docs/schema-map.md](docs/schema-map.md).
5. Upload the dialog (`slcrm_referraldecision.html` / `.js`) and the updated `slcrm_ReferralCommands.js` as web
   resources in the solution. Bump the `?v=` on the script tag whenever you redeploy a bundle, because Dynamics can
   keep serving a stale script from a versioned URL.
6. Publish all customizations, run the checks in [docs/integration-test-plan.md](docs/integration-test-plan.md) with
   `SMOKE-` test records, then export both package types again and commit them.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `The option 'X' does not exist on <table>.statuscode` | A status label in the environment was renamed. Update `OptionLabels.cs` to match. |
| `CONFIG-RANK-001` on every decision | The `slcrm_RankDirection` environment variable has no value or an invalid one. |
| `SLR-AUTH-403` for the right person | The user is not the item's **Assigned Approver** (approver actions) or the referral's **Primary Underwriter** (everything else). Check those lookups. |
| `SLR-AUTH-PRODUCT` / `-EXPIRED` / `-RANK` | The authority assignment is for another product, out of date, or below the item's required level. See [docs/lifecycle.md](docs/lifecycle.md). |
| `SLR-STATUS-409` after a double click | Expected: the first click already decided the item. Refresh the form. |
| `SLR-CONCURRENCY-412` | Someone else changed the item while you were working. Refresh and retry. |
| "registered on the wrong message" | The plug-in type is bound to the wrong Custom API. See [docs/plugin-registration.md](docs/plugin-registration.md). |
| Button does nothing after a redeploy | The browser or Dynamics cached the old script. Bump the `?v=` in `decision-dialog.html` and redeploy. |
| Unexpected error with a reference number | Open **Settings > Plug-in Trace Log** (enable tracing first) and search for that correlation id. |
| `dotnet` says SDK 9.0.100 was not found | Install .NET SDK 9.0.x, or run `dotnet --list-sdks` to see what is installed. |

## Conventions

* Descriptive names, small methods, no framework. Each use case reads top to bottom.
* No Dataverse names or numbers outside `Referral.Dataverse`.
* Errors a user can fix are `LifecycleException` with a code from `LifecycleErrorCodes` and a safe message.
* Tests read as sentences: `Authorise_WhenCallerIsNotTheAssignedApprover_IsRefusedAndNothingIsWritten`.
