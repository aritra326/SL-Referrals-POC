# SL Referrals — dummy data (CSV)

Sample data for every `slcrm_` table in the SL Referrals & Rationale solution, built as one
coherent scenario: three customers, two brokers, eight opportunities, eight policies, seven
rationales, six referral requests, eight referral items, and their decisions/participants/
notifications.

**Import these with Power Apps → your table → Data (…) → Import data.** That wizard lets you
map each CSV column to a table column and choose the column type (Text / Lookup / Choice /
Date), which is what makes the plain-text values below resolve into real relationships.

## Try Copy Rationale immediately after import

Anchor Bay Logistics Ltd carries a 4-year Marine Cargo renewal chain, all sharing Policy
Reference `POL-2022-0101`, built specifically to demo Copy Rationale:

| Opportunity | Rationale |
|---|---|
| Anchor Bay Logistics - Marine Cargo FY23 | Final |
| Anchor Bay Logistics - Marine Cargo FY24 Renewal | Final (a real claim — escape of cargo water) |
| Anchor Bay Logistics - Marine Cargo FY25 Renewal | Final (a real fleet/volume change) |
| Anchor Bay Logistics - Marine Cargo FY26 Renewal | **none — this is the one to demo on** |

After import, open the **FY26 Renewal** Opportunity and click **Copy Rationale**. It will list
all three prior Final rationales, newest first, each with genuinely different content — so
picking FY24 over FY25 is a real choice, not just picking "the most recent."

## Import order matters

A lookup column here is plain text (the target record's name), not a GUID — a GUID from the
Dev environment this was generated in means nothing in yours. The import wizard resolves a
lookup by matching that text against records **already in your environment**, so anything a
file points at must be imported first. Import in this numbered order:

| # | File | Depends on |
|---|------|------------|
| 1 | `01-Country.csv` | — |
| 2 | `02-Product.csv` | — |
| 3 | `03-CoverSection.csv` | Product |
| 4 | `04-AuthorityLevel.csv` | — |
| 5 | `05-ReferralReason.csv` | Authority Level (optional column) |
| 6 | `06-UnderwriterAuthority.csv` | Authority Level, Product |
| 7 | `07-Account.csv` | — |
| 8 | `08-Opportunity.csv` | Account |
| 9 | `09-Policy.csv` | Opportunity, Account |
| 10 | `10-Rational.csv` | Opportunity, Policy, Account |
| 11 | `11-ReferralRequest.csv` | Account (Broker + Customer), Opportunity, Product |
| 12 | `12-ReferralItem.csv` | Referral Request, Referral Reason, Cover/Section, Authority Level |
| 13 | `13-ReferralDecision.csv` | Referral Item |
| 14 | `14-ReferralParticipant.csv` | Referral Request |
| 15 | `15-ReferralNotification.csv` | Referral Request, Referral Item, Referral Decision |

`Opportunity` is an out-of-box Dynamics 365 Sales table. Files 8–15 depend on it directly or
transitively (Referral Request *requires* it), so if a target environment doesn't have Sales
installed, only files 1–7 (the reference/lookup data) will import as-is — that's not the case
for the environment this batch is meant for, but worth knowing if you reuse these files
elsewhere.

## User columns are pre-filled with real names

Underwriter, Decision By, Participant User and Recipient User are populated with seven real
full names from the target environment — Vikram Arora, Jade Norridge, Aditya Vichare, Michael
Tanner, Ian Fischer, Lahari Iruvuri, Balachandar Siva — so these resolve on import the same
way any other lookup column does, with no post-import step. Assignment isn't random: the same
underwriter carries a renewal chain year over year (Vikram Arora owns Anchor Bay's FY23–FY26
Marine Cargo programme throughout), and notification recipients follow the underwriter who
owns that referral.

- `06-UnderwriterAuthority.csv` — Underwriter
- `10-Rational.csv` — Underwriter
- `13-ReferralDecision.csv` — Decision By
- `14-ReferralParticipant.csv` — Participant User
- `15-ReferralNotification.csv` — Recipient User

These names must exist as users in the target environment for the lookup to resolve — a
system user record still can't be created by data import itself (that's provisioned by
licensing). If a name doesn't match anyone there, that one row's lookup will come through
blank rather than fail the whole import; re-point it manually afterward.

## Choice columns

The wizard matches choice/status columns by label text, case-insensitively, against the
option set already defined on the table (these were created by the SL_Referrals solution, so
the labels already match). Columns used here: Priority, Transaction Type, Policy Type,
Decision Type, Participant Role, Rationale Status, Licence Scheme, Event Type, Processing
Status, Status Reason.

## Files

| File | Table | Rows |
|---|---|---|
| `01-Country.csv` | Country | 8 |
| `02-Product.csv` | Product | 5 |
| `03-CoverSection.csv` | Cover / Section | 10 |
| `04-AuthorityLevel.csv` | Authority Level | 4 |
| `05-ReferralReason.csv` | Referral Reason | 6 |
| `06-UnderwriterAuthority.csv` | Underwriter Authority | 5 |
| `07-Account.csv` | Account (2 brokers, 3 customers) | 5 |
| `08-Opportunity.csv` | Opportunity | 8 |
| `09-Policy.csv` | Policy | 8 |
| `10-Rational.csv` | Rationale | 7 |
| `11-ReferralRequest.csv` | Referral Request | 6 |
| `12-ReferralItem.csv` | Referral Item | 8 |
| `13-ReferralDecision.csv` | Referral Decision | 4 |
| `14-ReferralParticipant.csv` | Referral Participant | 6 |
| `15-ReferralNotification.csv` | Referral Notification | 8 |
