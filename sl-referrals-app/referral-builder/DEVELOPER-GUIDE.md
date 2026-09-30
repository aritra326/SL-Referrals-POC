# Referral Builder & Copy Rationale — Developer Guide

**Audience:** a Dataverse/Power Platform developer who does not know React, TypeScript's JSX
syntax, or Fluent UI, and wants to make changes to these two screens without needing an AI
assistant to do it. Read this once end to end; after that, use it as a reference — jump to the
section you need.

**One correction up front:** this app does not use Bootstrap anywhere. All the UI controls
(buttons, dropdowns, text fields, the colours, the layout) come from **Fluent UI v9**
(`@fluentui/react-components`), Microsoft's own component library — the same visual language as
the rest of Power Apps and Dynamics 365. If you go looking for Bootstrap classes like `col-md-6`
or `btn-primary`, you won't find any; the equivalent concepts exist, just under different names,
covered in §4 below.

---

## 1. What this actually is

Both screens — **Referral Builder** (`New Referral` in the sitemap) and **Copy Rationale**
(the button on the Opportunity command bar) — are **HTML web resources**, not custom pages and
not (in their live, working form) PCF controls. That choice was deliberate: a custom page runs
as a canvas app in a nested iframe, which Microsoft's own docs say requires third-party cookies
to be enabled for its silent sign-in to work — and that's unreliable in most browsers today. A
web resource is a plain HTML+JS file served **from the Dataverse origin itself**, so it
authenticates with the same session cookie the rest of the model-driven app uses. No iframe,
no token dance, nothing to misconfigure in the browser.

Concretely, each screen is:

- One **React application**, written in TypeScript, that gets compiled ("bundled") by webpack
  into a single `.js` file.
- One tiny **HTML file** that does nothing but load that `.js` file into a `<div id="root">`.
- Both files are uploaded to Dataverse as ordinary **web resources** (`slcrm_referralbuilder.js`
  / `.html`, `slcrm_copyrationale.js` / `.html`) — the exact same mechanism you'd use to upload
  a JavaScript web resource for a form's OnLoad handler, just a much bigger one.

There is **no server, no API you host, no database of your own**. All data comes from Dataverse
via the same Web API you already use from JavaScript web resources or plug-ins
(`/api/data/v9.2/...`) — just called through `fetch()` instead of `Xrm.WebApi`.

**React, in one paragraph, for someone who's never touched it:** a React "component" is a
function that returns a description of some HTML (written in a JSX syntax that looks like HTML
mixed into the function). React calls that function again — automatically — every time
something the function depends on changes, and only patches the real HTML that actually
changed. "State" is just a variable that, when you update it through a special setter function,
triggers that re-run. That's genuinely most of what you need to know to *read* this codebase;
§4 covers the handful of patterns actually used here.

---

## 2. File map — what lives where

```
sl-referrals-app/referral-builder/pcf/
├── ReferralBuilder/                    <- shared source, used by BOTH screens
│   ├── components/
│   │   ├── ReferralBuilderApp.tsx      <- the whole Referral Builder screen (THE big one)
│   │   ├── CopyRationaleApp.tsx        <- the whole Copy Rationale screen
│   │   ├── ReferralItemCard.tsx        <- one "referral item" card inside the builder
│   │   ├── ErrorBoundary.tsx           <- catches crashes, shows an error instead of a blank page
│   │   ├── styles.ts                   <- ALL visual styling for Referral Builder
│   │   └── copyRationaleStyles.ts      <- ALL visual styling for Copy Rationale
│   ├── services/
│   │   ├── DataverseService.ts         <- thin wrapper: create/retrieve/update records
│   │   ├── ReferenceDataService.ts     <- loads dropdown data (products, reasons, etc.)
│   │   ├── ReferralService.ts          <- saves a referral request + its items
│   │   └── RationaleService.ts         <- Copy Rationale's data logic (§5.7)
│   ├── models/ReferralModels.ts        <- TypeScript shapes for a "draft" referral in memory
│   ├── config/DataverseSchema.ts       <- every Dataverse field/table name used, in one place
│   ├── index.ts                        <- PCF control entry point (see the note in §9)
│   └── HelloWorld.tsx                  <- IGNORE — leftover scaffold, not used anywhere
│
├── webresource/                        <- the two deployable bundles + their HTML shells
│   ├── index.tsx                       <- Referral Builder's entry point (mounts ReferralBuilderApp)
│   ├── index.html                      <- Referral Builder's HTML shell
│   ├── copy-rationale-index.tsx        <- Copy Rationale's entry point
│   ├── copy-rationale.html             <- Copy Rationale's HTML shell
│   ├── XrmHost.ts                      <- makes the Dataverse Web API work from a plain web page
│   ├── OpportunityCommands.js          <- the ribbon button JS that opens Copy Rationale
│   ├── build.js                        <- builds Referral Builder's bundle
│   ├── build-copy-rationale.js         <- builds Copy Rationale's bundle
│   ├── make-bodies.js                  <- packages the built files for upload (Referral Builder)
│   ├── dist/                           <- build OUTPUT (gitignored — never hand-edit here)
│   └── dev/                            <- local preview harness, see §6
│
└── ReferralBuilder/ControlManifest.Input.xml   <- PCF manifest (see §9 — not the live path)
```

**If you only remember one thing:** almost every business-requirement change you'll be asked
for lives in `ReferralBuilderApp.tsx`, `CopyRationaleApp.tsx`, `styles.ts`, or
`copyRationaleStyles.ts`, plus occasionally `DataverseSchema.ts` if a Dataverse field name
changes. The rest of the files are plumbing you'll rarely need to open.

---

## 3. How a change actually reaches the app — the loop

This is the one thing that trips people up coming from JavaScript web resources, where you edit
a file and re-upload it directly. Here, there's a **build step** in between:

```
1. Edit a .tsx / .ts file                (source code, readable, in the repo)
2. Run the build script                   (webpack bundles everything into ONE .js file)
3. Upload the built .js to Dataverse       (PATCH the webresourceset record's content)
4. Publish customizations
5. Hard-refresh the browser (Ctrl+Shift+R) (the browser has the OLD bundle cached)
```

Editing a `.tsx` file and refreshing the browser **does nothing** — the browser only ever loads
the built `.js` file from Dataverse, never your source files directly. Steps 2–5 are non-
negotiable every time. §7 gives you the exact commands.

---

## 4. Just enough React/JSX/Fluent UI to read and edit this code

You do not need to learn React properly to make the changes you'll actually be asked for. Here
is everything this codebase actually uses.

### 4.1 JSX — HTML-looking code inside a function

```tsx
return (
    <div className={s.root}>
        <h1>Create referral</h1>
        {loading && <Spinner />}
    </div>
);
```

Read this exactly like HTML, with three differences:
- `className` instead of `class` (JavaScript reserves the word `class`).
- `{ ... }` drops into plain JavaScript. `{loading && <Spinner />}` means "if `loading` is
  true, show the spinner; if false, show nothing" — the most common way you'll see something
  conditionally appear.
- Every tag must close. `<input />` not `<input>`.

### 4.2 Props — how a component is configured, like attributes

```tsx
<Button appearance="primary" onClick={() => void save()}>
    Save referral
</Button>
```

`appearance`, `onClick` etc. are **props** — think of them exactly like attributes on an HTML
tag, or parameters into a function. `onClick={() => void save()}` means "when clicked, run the
`save` function." You will mostly be changing prop *values* (text, colours, which function
runs), not adding new kinds of props.

### 4.3 State — a value that, when changed, redraws the screen

```tsx
const [priority, setPriority] = React.useState("Medium");
```

This declares a variable `priority` (currently `"Medium"`) and a function `setPriority` that
changes it. Call `setPriority("High")` anywhere and every place `priority` is used on screen
updates automatically. You'll see this pattern dozens of times — `const [x, setX] =
React.useState(...)` — always read it the same way: "a value, and the function that changes it."

In this app, most of the form's fields live together in one object called `draft`:

```tsx
const [draft, setDraft] = React.useState<ReferralDraft>(emptyDraft);
```

To change one field on it without losing the others, the pattern is:

```tsx
setDraft((d) => ({ ...d, priority: newValue }));
```

Read `{ ...d, priority: newValue }` as "copy everything from the old draft `d`, then overwrite
`priority`." This exact three-line shape (`setDraft((d) => ({ ...d, FIELD: value }))`) is what
you'll copy-paste-adapt for almost any "when the user changes X, update the draft" change.

### 4.4 Lists — `.map()` instead of a loop

```tsx
{draft.items.map((item, index) => (
    <ReferralItemCard key={item.clientKey} item={item} index={index} />
))}
```

This renders one `ReferralItemCard` per entry in `draft.items`. `key={...}` is required by
React (it needs a stable identifier per row) — always give it something unique, never the
array index alone if rows can be reordered or removed.

### 4.5 Fluent UI — the component catalogue

Every visible control — `Button`, `Dropdown`, `Field`, `Input`, `Textarea`, `MessageBar`,
`Badge`, `Spinner` — is imported at the top of the file from `@fluentui/react-components`:

```tsx
import { Button, Dropdown, Field, Input } from "@fluentui/react-components";
```

The full catalogue, with every prop each component accepts and live examples, is Microsoft's
own **Fluent UI React v9 Storybook**: **https://react.fluentui.dev/**. If you want a new kind of
control (e.g. a date picker, a checkbox), search for it there first — it's almost certainly
already in the library, and you import it the same way.

Icons come from `@fluentui/react-icons` (imported as e.g. `SaveRegular`, `AddRegular`) —
browse the full icon set at **https://react.fluentui.dev/?path=/docs/icons-catalog--page**.

### 4.6 Styling — `styles.ts`, not CSS files, not Bootstrap

There is no `.css` file. Styling is defined as JavaScript objects in `styles.ts` /
`copyRationaleStyles.ts`, using real CSS property names (`backgroundColor`, `fontSize`,
`borderRadius` — camelCase instead of `background-color`), and applied via a generated
`className`:

```ts
// styles.ts
export const useStyles = makeStyles({
    title: {
        fontSize: tokens.fontSizeHero800,
        fontWeight: tokens.fontWeightSemibold,
        color: tokens.colorNeutralForeground1,
    },
});
```

```tsx
// ReferralBuilderApp.tsx
const s = useStyles();
<h1 className={s.title}>Create referral</h1>
```

`tokens.xxx` are Fluent UI's **design tokens** — the same colours/spacing/type sizes used
across all of Power Apps, so using them (rather than a hardcoded hex colour) keeps the page
consistent and correctly themed (including dark mode). See the full token list at
**https://react.fluentui.dev/?path=/docs/theme-design-tokens--page**. Changing a colour or size
almost always means: open `styles.ts`, find the relevant style block, change the value.

---

## 5. Cookbook — common changes, and exactly where to make them

### 5.1 Change label text, help text, or any wording on screen

Open `ReferralBuilderApp.tsx` (or `CopyRationaleApp.tsx`), search (Ctrl+F) for the visible text
you want to change — it appears verbatim in the file as a plain string. Change it, save,
rebuild, redeploy (§7).

> This is exactly the class of bug that was just fixed in this file: a couple of em-dashes (—)
> and ellipses (…) had gotten corrupted into garbled characters (`â€"`) at some point. If you
> ever see mangled characters like that in the running app, the fix is: open the `.tsx` file,
> find the bad text, retype the character cleanly, save, rebuild, redeploy. It's almost always
> the source file itself, not a display/charset problem — confirm by opening the file and
> looking for stray `Ã`/`â€` sequences.
>
> **One real trap to know about:** if you ever edit these files with PowerShell (`Get-Content` /
> `Set-Content`) instead of a proper code editor, PowerShell's default encoding can silently
> corrupt special characters (£, —, …, accented letters) on save. Always edit `.tsx`/`.ts` files
> in VS Code (or another real editor), never via PowerShell text manipulation.

### 5.2 Add, remove, or reorder a field on the Referral Builder form

1. **If it's a new Dataverse column:** add the entry to `ReferralModels.ts` (the `ReferralDraft`
   or `ReferralItemDraft` interface) and to `DataverseSchema.ts` (so the field's Dataverse
   logical name is defined in one place, not scattered through the code).
2. In `ReferralBuilderApp.tsx`, find the `<Field label="...">...</Field>` block for a field near
   where you want the new one, and copy its shape. A typical text field looks like:
   ```tsx
   <Field label="Quote number" required>
       <Input
           value={draft.quoteNumber ?? ""}
           onChange={(_, d) => setDraft((prev) => ({ ...prev, quoteNumber: d.value }))}
       />
   </Field>
   ```
3. In `ReferralService.ts`, add the field to the object that gets sent to `DataverseService.create()`
   / `.update()` — otherwise your new field will show in the UI but never actually save.
4. To remove a field: delete its `<Field>` block and its line in the save payload in
   `ReferralService.ts`. Leave it in `ReferralModels.ts`/`DataverseSchema.ts` unless you're sure
   nothing else references it.

### 5.3 Change validation rules (what's "required" before Save is enabled)

Search `ReferralBuilderApp.tsx` for `errors` / `ValidationErrors` — there's one block (a
`React.useMemo`) that computes every validation error from the current `draft`, something like:

```tsx
if (!draft.opportunityId) e.context.opportunityId = "Opportunity is required.";
```

Add, remove, or change the condition for any field the same way. The rest of the form (the red
outline, the error banner, the disabled Save button) reacts automatically — you don't need to
touch anything else.

### 5.4 Change what happens when the user selects a dropdown value
### (e.g. "populate another field automatically")

Search for the `on<FieldName>` handler near that dropdown, e.g. `onOpportunity`:

```tsx
const onOpportunity = async (id?: string) => {
    setDraft((d) => ({ ...d, opportunityId: id }));
    if (!id) return;
    const ctx = await services.ref.loadOpportunityContext(id);
    setDraft((d) => ({ ...d, customerId: ctx.customerId }));
};
```

This is the exact mechanism behind "select an Opportunity → Customer fills in automatically."
To make a different field auto-populate on a different selection, copy this shape: on selection,
`await` a lookup (in `ReferenceDataService.ts` — add a new method there if you need to query a
different table), then `setDraft` with the result.

### 5.5 Change colours, spacing, fonts, layout

All in `styles.ts` (Referral Builder) or `copyRationaleStyles.ts` (Copy Rationale). Find the
named style block (`title`, `cardHead`, `cmdBar`, etc. — names are descriptive), change the
values. Use `tokens.xxx` (§4.6) rather than a hardcoded colour wherever a similar token already
exists nearby, so dark mode keeps working.

### 5.6 Add a new dropdown of choices (e.g. a Dataverse choice/option-set column)

1. If it's a Dataverse choice column, add its option values to `DataverseSchema.ts` under
   `Choices`, matching the real option values (**query Dataverse for the actual numeric
   values** — never guess them, they're publisher-specific. See §8's note on this exact
   mistake).
2. Add a small constant array of `{ id, label }` near the top of `ReferralBuilderApp.tsx` (copy
   the shape of `PRIORITIES` or `POLICY_TYPES`).
3. Add a `<Field>` + `<Dropdown>` block (copy an existing one — e.g. the Priority dropdown is a
   good template), wiring `onOptionSelect` to `setDraft`.

### 5.7 Copy Rationale — which years are offered, what gets copied

All of this logic lives in `RationaleService.ts`, not in the component. Two things you'll most
likely be asked to change:

- **Data model:** Policy 1:N Opportunity (one Opportunity per renewal, via the
  `Opportunity.slcrm_Policy` lookup) and Opportunity 1:N Rationale. There is exactly one Policy
  row per policy; renewals never create a new Policy row. In the POC the renewal Opportunity is
  created by hand and its Policy lookup is set; in production the system creates it.
- **Which rationales are offered to copy from:** the `loadCopyableRationales` method — currently
  every `Status = Final` Rationale whose Opportunity points at the same Policy as the current
  Opportunity, excluding the current Opportunity. Change the filter there.
- **Known gap:** the new Rationale's Renewal Year is the current calendar year
  (`CopyRationaleApp.tsx`), not the year of the renewal Opportunity.
- **Deploy gotcha:** Dynamics can keep serving a stale `slcrm_copyrationale.js` from a versioned
  URL after a re-upload. `copy-rationale.html` therefore loads the script with a `?v=` query
  string; bump it whenever you redeploy the bundle.
- **Which fields get copied vs. left blank on the new record:** the `Rational.copyableFields`
  array in `DataverseSchema.ts` — add or remove a Dataverse field's logical name there to
  include/exclude it from copying. Fields not listed are always left for the underwriter to fill
  in fresh (deliberately — see the comment above that array for why, e.g. Underwriter and
  Status are never copied).

### 5.8 Change an icon on a command bar button

These are **not** part of this React app — the working, visible icons today are separate PNG
web resources referenced from the ribbon/command definition, not anything in this codebase. To
swap an icon: upload a new web resource image and repoint the button's icon reference to it via
the app's Command Designer (or classic ribbon editor, if it's one of the legacy buttons — see
the note in §9). If you're prompted to pick from Fluent's built-in icon set in the modern
Command Designer instead of uploading your own file, search that picker directly — you don't
need this repo for that at all.

---

## 6. Preview a change locally — no Dataverse needed

There's a small local test harness at `webresource/dev/` that runs the **real**
`ReferralBuilderApp` component against **fake, hardcoded data** (`webresource/dev/harness.tsx`),
served on your machine. This is the fastest way to check a UI/logic change before touching
Dataverse at all.

```powershell
cd sl-referrals-app/referral-builder/pcf
node webresource/dev/build.js
node webresource/dev/serve.js
```

Then open **http://localhost:5599** in a browser. Edit `harness.tsx` if you need different mock
data for what you're testing (e.g. more mock Opportunities). This harness does **not** need to
be redeployed to Dataverse — it's purely local, and it's gitignored (`dev/dist/`) so its output
never pollutes the repo.

This is *also* how you'd debug a rendering bug: reproduce it here first, where you have full
browser dev tools and no Dataverse round-trip in the way, before assuming it's a data problem.

---

## 7. Deploying a change to Dataverse

Two build scripts, one per screen — run whichever one(s) you touched:

```powershell
cd sl-referrals-app/referral-builder/pcf

# Referral Builder ("New Referral" in the sitemap)
node webresource/build.js
# -> writes webresource/dist/slcrm_referralbuilder.js

# Copy Rationale (the Opportunity command bar button)
node webresource/build-copy-rationale.js
# -> writes webresource/dist/slcrm_copyrationale.js
```

Both share most of their source (`ReferralBuilder/`), so a change to something like
`DataverseSchema.ts` may require rebuilding **both**.

Then upload the built file's content to the matching `webresourceset` record and publish. The
pattern (PowerShell + the Dataverse Web API directly — same approach as any script-based
deployment):

```powershell
# 1. Base64-encode the built file into a PATCH body
node -e "const fs=require('fs');fs.writeFileSync('body.json', JSON.stringify({content: fs.readFileSync('webresource/dist/slcrm_referralbuilder.js').toString('base64')}));"

# 2. PATCH the existing web resource's content (find its id first via a GET filtering on name)
# PATCH [org url]/api/data/v9.2/webresourceset(<id>)   body = body.json

# 3. Publish that web resource
# POST [org url]/api/data/v9.2/PublishXml
# body = { "ParameterXml": "<importexportxml><webresources><webresource>{id}</webresource></webresources></importexportxml>" }
```

If you're more comfortable doing steps 2–3 by hand: open the web resource in
**make.powerapps.com → Solutions → your solution → the web resource → Edit**, and there's an
**Upload file** button that does exactly this through the UI — pick the newly-built file from
`webresource/dist/`, save, publish. That's the simplest path if you don't want to script it.

**Always finish with a hard refresh (Ctrl+Shift+R)** in the browser — a normal refresh can serve
the old, cached bundle.

---

## 8. Debugging when something breaks

- **A blank page, or the screen goes blank when you interact with something:** every screen is
  wrapped in `ErrorBoundary.tsx`, so a genuine JavaScript error should show a readable error
  message and stack trace instead of going silently blank. If you *do* get a silent blank page,
  open the browser console (F12 → Console) — something is throwing before React even mounts.
- **A dropdown/field doesn't do what you expect:** open the console and Network tab (F12).
  Every Dataverse call goes through `fetch()`, visible in the Network tab exactly like an XHR
  call from any JavaScript web resource — check the request URL and response body directly.
- **"Could not find a property" or "lookup cannot be resolved" style errors from the Web API:**
  almost always a wrong Dataverse logical name or a wrong `@odata.bind` navigation property
  name. Navigation property casing for a lookup is **not always what you'd guess** — a custom
  `slcrm_` lookup's nav property is usually its SchemaName (e.g. `slcrm_Opportunity`), but some
  out-of-box lookups use the plain lowercase logical name instead (e.g. Opportunity's
  `parentaccountid`, not `ParentAccountId`). When in doubt, query
  `EntityDefinitions(LogicalName='<table>')/ManyToOneRelationships` for the real
  `ReferencingEntityNavigationPropertyName` rather than guessing from the field name.
- **A choice/option-set value doesn't save correctly:** the numeric values in
  `DataverseSchema.ts` under `Choices` are specific to this environment's publisher — never
  assume they'll be the same numbers in another environment (they won't be). Always confirm
  against the live option set metadata before hardcoding a new one.
- **Selecting a lookup's value in `$select` fails with "could not find a property":** Dataverse
  Web API requires the wrapped form for a lookup's id, e.g. `_slcrm_customerinsured_value`, not
  the bare `slcrm_customerinsured` — this only applies to `$select`, not to `@odata.bind` on
  write.

---

## 9. A couple of things that look important but aren't the live path

- **`ReferralBuilder/index.ts` and `ReferralBuilder/ControlManifest.Input.xml`** define this as
  a **PCF control** — an earlier build target from before the switch to web resources. The PCF
  control shares the same `ReferralBuilderApp` component, so a change to that component affects
  both build targets, but the web resource (`webresource/`) is the one actually in day-to-day
  use. You generally don't need to touch or rebuild the PCF project for a normal change.
- **`HelloWorld.tsx`** — dead scaffold from `pac pcf init`, never wired up to anything. Ignore
  it; safe to delete if it bothers you.
- **`XrmHost.ts`** — infrastructure that lets a plain web page call the Dataverse Web API the
  same way a PCF control would. You should essentially never need to change this file; if a
  Web API call is failing, the fix is almost always in the calling code (a service file), not
  here.
