# SL Referrals web resources (readable JavaScript)

Every page and script the app adds to Dynamics lives in this folder as **plain JavaScript, HTML and CSS**.
There is no framework, no bundler, no minifier and no build step. What you read here is exactly what runs.
Anyone who can read JavaScript can find a bug in these files and fix it.

Two rules apply to every file here, and `tests/sourceRules.test.js` fails if someone breaks them:

1. **Dataverse is only called through `Xrm.WebApi`.** No `fetch()` and no `XMLHttpRequest`.
2. **Files stay readable.** ASCII characters only (write `…` for an ellipsis and `—` for a dash), no line longer
   than 170 characters, no byte-order mark, no `require`/`import`.

## What is in the folder

| File | Uploaded to Dataverse as | What it is |
|---|---|---|
| `slcrm_common.js` | `slcrm_common.js` | Helpers every page uses: find `Xrm`, read launch parameters, call a Custom API, build HTML, show errors |
| `slcrm_common.css` | `slcrm_common.css` | The shared look (colours are variables at the top: change one place) |
| `slcrm_referraldecision.html` / `.js` | same names | The decision dialog: Authorise, Reject, Authorise with recommendations, Request information, Onward, Accept rejection, Complete partial, Cancel |
| `slcrm_copyrationale.html` / `.js` | same names | Copy Rationale: pick an earlier Final rationale for the policy and copy it into a new Draft |
| `slcrm_referralbuilder.html` / `.js` | same names | New Referral: shared context plus one or more referral items, saved as Draft |
| `slcrm_ReferralCommands.js` | same name | Command bar buttons on Referral and Referral Item (open the dialog or call the Custom API) |
| `slcrm_OpportunityCommands.js` | same name | The "Copy Rationale" button on Opportunity |
| `tests/` | not uploaded | Automated tests (see below) |
| `dev/` | not uploaded | A fake `Xrm` so you can click through the pages on your own machine |
| `Deploy-WebResources.ps1`, `Build-SolutionZip.ps1` | not uploaded | Developer tools (see "Changing something") |

## How a page is built (read `slcrm_referraldecision.js` first, it is the shortest)

Each page script is one `SLCRM.<PageName> = (function () { ... })();` and has the same sections, in this order:

1. **Settings / schema** - table and column names, choice values and the text of each action, in one place. Most changes start here.
2. **Dataverse calls** - small `async` functions. Each one makes one `Xrm.WebApi` call and returns plain data.
3. **Rules** (builder only) - validation and calculations as plain functions with no screen code.
4. **The screen** - a `state` object, a `draw()` function that rebuilds the page from `state`, and button handlers that change
   `state` and call `draw()`.

`el("div", { className: "box" }, "text")` (in `slcrm_common.js`) creates an HTML element. Text you pass is always shown as plain text,
never as HTML, so a comment typed by a user cannot inject markup.

How the Xrm calls look:

```js
// read one record
const item = await Xrm.WebApi.retrieveRecord("slcrm_referralitem", id, "?$select=slcrm_itemsummary");
// read a list
const result = await Xrm.WebApi.retrieveMultipleRecords("slcrm_product", "?$select=slcrm_name&$orderby=slcrm_name asc");
// create a record (a lookup is set with "<NavigationName>@odata.bind")
await Xrm.WebApi.createRecord("slcrm_rational", { slcrm_name: "x", "slcrm_Policy@odata.bind": "/slcrm_policies(" + policyId + ")" });
// call a Custom API bound to a record (wrapped by common.runBoundAction)
await Xrm.WebApi.online.execute(request);
```

Column names are lower case (`slcrm_pricing`). The name on the left of an `@odata.bind` is the lookup's **SchemaName**
and is mixed case (`slcrm_Policy`). Mixing them up is the most common mistake; the SCHEMA block at the top of each page explains it.

## Changing something

1. Edit the file. Keep the two rules above.
2. Run the tests (needs Node 20 or later, nothing to install):
   ```powershell
   node --test "sl-referrals-app/webresources/tests/*.test.js"
   ```
3. Look at it in a browser without Dataverse:
   ```powershell
   node sl-referrals-app/webresources/dev/serve.js
   ```
   then open <http://localhost:5600>. The page is served with a fake `Xrm` fed from `data-export/data`. Every call the page
   makes is listed in `window.__xrmLog` in the browser console. The fake only understands the query features these pages use,
   so **always try a changed query in a real environment too**.
4. Put it into an environment. Either:
   - quickest, for trying an edit (needs `az login` to that environment's tenant):
     ```powershell
     .\sl-referrals-app\webresources\Deploy-WebResources.ps1 -OrgUrl https://<your-env>.dynamics.com -Only slcrm_referralbuilder.js
     ```
   - or by hand: Power Apps > Solutions > SL Referrals > the web resource > **Edit** > paste the file > Save > **Publish**.
5. **Hard-refresh the app (Ctrl+F5).** The browser caches scripts by their address. When you release a change, also raise the
   `?v=` number in the three `.html` files (they must all match; the tests check that) so users do not get the old script.
6. To make a new solution package for another environment:
   ```powershell
   cd sl-referrals-app\webresources
   .\Build-SolutionZip.ps1 -SourceZip ..\..\solution-export\SL_Referrals_1_0_0_20.zip         -Version 1.0.0.21
   .\Build-SolutionZip.ps1 -SourceZip ..\..\solution-export\SL_Referrals_1_0_0_20_managed.zip -Version 1.0.0.21 -Managed
   ```
   Keep both the unmanaged and the managed zip in `solution-export/`.

## Where each page is launched from

| Page | Launched by |
|---|---|
| `slcrm_referraldecision.html` | `slcrm_ReferralCommands.js` (`openLifecycleDialog`) with `?data=recordId=...&entityName=...&actionName=...` |
| `slcrm_copyrationale.html` | `slcrm_OpportunityCommands.js` (`openCopyRationale`) with `?data=recordId=<opportunity>&entityName=opportunity` |
| `slcrm_referralbuilder.html` | The "New Referral" site map entry (`$webresource:slcrm_referralbuilder.html`) |

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "This page must be opened from inside the Referrals & Rationale app" | The page was opened by its URL on its own. Open it from the app. |
| A page shows the old behaviour after a deploy | Cached script. Ctrl+F5, and raise the `?v=` number in the `.html` files. |
| "No data available" instead of the page | The file starts with a byte-order mark. Save it as UTF-8 **without** BOM (PowerShell 5.1 `-Encoding utf8` adds one). |
| A lookup is not saved, or "Could not find a property named ..." | The `@odata.bind` name must be the SchemaName with its exact capitalisation; a selected lookup id needs the `_name_value` form. |
| An action fails with `SLR-...` in small print | That is the server's rule talking (a plug-in). The sentence next to the code says what to do. See `referral-lifecycle/docs`. |
| "The eligible authorities could not be loaded" | The `slcrm_GetEligibleAuthorities` Custom API failed. Check the plug-in is registered (`referral-lifecycle/docs/plugin-registration.md`). |

## Known leftover

The solution still contains one minified file that is **not** part of these pages: the Power Apps component framework control
`SL.Referrals.ReferralBuilder` (`Controls/.../bundle.js`). It is not placed on any form; it belongs to the older Referral Builder
canvas page that the HTML page above replaced. It can be removed from the solution once you have confirmed in the target
environment that nothing depends on it.
