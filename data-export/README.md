# SL Referrals data export and import

Exported from Dev (`61858932.crm17.dynamics.com`), solution up to **1.0.0.19**. The Dev trial environment has since expired, so this folder and `solution-export/` are the only copy.

## Move the app and data to another environment
1. Import `solution-export/SL_Referrals_1_0_0_20.zip` (or `_managed.zip`) into the target. 1.0.0.20 carries the readable web resources. This creates the tables,
   forms, app, theme and the web resources below.
2. `az login` to the target tenant, then:
   ```powershell
   .\Import-Data.ps1 -OrgUrl https://<target>.crm.dynamics.com
   ```
   Records are upserted by their original GUID, so it is safe to re-run. Users are matched by email; anyone not found
   becomes the user running the import. Run it before registering the lifecycle plug-ins, otherwise the decision guard
   may reject the historic decisions.
3. Apply the top-bar logo (themes cannot be put in a solution, so this is a separate step):
   ```powershell
   ..\sl-referrals-app\branding\Apply-Branding.ps1 -OrgUrl https://<target>.crm.dynamics.com
   ```
   The app tile icon comes with the solution; the top-bar logo comes from this theme. The theme is environment-wide.
4. Re-export from Dev at any time with `.\Export-Data.ps1`.

## Contents of `data/`
account (6), opportunity (14), and the 13 `slcrm_` tables (country 3, product 6, cover section 8, authority level 8,
referral reason 15, policy 5, rationale 11, underwriter authority 9, referral request 17, referral item 27, referral
decision 14, participant 6, notification 6). Only the accounts and opportunities the referrals point at are included.
`manifest.json` holds the import order.

## Dialog, Copy Rationale and Referral Builder files

These are now plain readable JavaScript in `sl-referrals-app/webresources/` (see its README.md). They are no longer copied here.

## Note on opportunity links

The first export lost each opportunity's link to its policy and customer. They were rebuilt from the rationales, policies and referrals
(10 of 14 opportunities have a policy; the other 4 are Microsoft's sample cafe opportunities, which have none). `Export-Data.ps1` is fixed
so a future export keeps those links.
