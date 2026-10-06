# CSV export of the SL Referrals data

One CSV per table, 15 files, numbered in the order they must be imported (parents before children). Produced by
`data-export/Export-Csv.ps1` from the RR-Dev environment, which holds the same data as the original Dev export.

| Order | File | Rows |
|---|---|---|
| 1 | 01-account.csv | 6 |
| 2 | 02-opportunity.csv | 14 |
| 3 | 03-slcrm_country.csv | 3 |
| 4 | 04-slcrm_product.csv | 6 |
| 5 | 05-slcrm_coversection.csv | 8 |
| 6 | 06-slcrm_authoritylevel.csv | 8 |
| 7 | 07-slcrm_referralreason.csv | 15 |
| 8 | 08-slcrm_policy.csv | 5 |
| 9 | 09-slcrm_rational.csv | 11 |
| 10 | 10-slcrm_underwriterauthority.csv | 9 |
| 11 | 11-slcrm_referralrequest.csv | 17 |
| 12 | 12-slcrm_referralitem.csv | 27 |
| 13 | 13-slcrm_referraldecision.csv | 14 |
| 14 | 14-slcrm_referralparticipant.csv | 6 |
| 15 | 15-slcrm_referralnotification.csv | 6 |

## Format
- First column is the row's GUID (`<table>id`). Map it to the primary key when importing so rows keep their ids and a re-import updates instead of duplicating.
- Choice, status and yes/no columns hold the **label** (e.g. `Onward for Approval`, `Yes`). The import wizard maps labels to options.
- Lookup columns hold the target row's **primary name** (e.g. `Trey Research`, `REF-001000`). The wizard resolves them by name, which is why the
  import order matters: a lookup target must already exist.
- Dates are ISO 8601 UTC. Money and decimals are plain numbers. UTF-8 with BOM.

## Importing manually (Power Apps > Tables > table > Import > Import data from Excel/CSV)
1. Import the SL_Referrals solution first (`solution-export/SL_Referrals_1_0_0_20.zip`) so the tables exist.
2. Import the files in the numbered order. On the mapping screen, check that every column is mapped, and for lookups pick the target table's
   primary name column.
3. User lookups (submitted by, primary underwriter, assigned approver, ...) hold full names and resolve against users in the target. Any that do not
   match need to be fixed in the file or left unmapped.
4. Names that repeat within a table can resolve to the wrong row. If that happens, use `data-export/Import-Data.ps1` instead, which matches by GUID.

## Why the order is not strictly account > opportunity > policy > ...
The flow you describe is right, but a few small reference tables have to exist first because policy, referral request and referral item look them up
(product, country, cover section, authority level, referral reason, underwriter authority). That is why the numbered order is account, opportunity,
then the reference tables, then policy, rationale, referral request, referral item, decision, participant, notification.

Opportunity and policy point at each other (`opportunity.slcrm_policy` and `policy.slcrm_opportunity`). On the first import of
`02-opportunity.csv` the Policy column cannot resolve yet, so leave it unmapped, import policy (08), then re-import `02-opportunity.csv` with the
Policy column mapped (the GUID in column 1 makes it update the same rows).

Only the 14 opportunities that referrals or policies point at are exported (the environment has 14 more of Microsoft's sample opportunities).
