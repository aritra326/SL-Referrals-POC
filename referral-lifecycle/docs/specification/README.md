# Specification (version-controlled copy)

[`original-spec.txt`](original-spec.txt) is the agreed Referral & Rationale implementation specification, stored here so the
whole team can read it. It used to exist only as a developer-local, git-ignored file; **this copy is now the shared one.**
Do not copy its text into source-code comments; cite section numbers instead (for example "spec 11.4").

**The spec is the starting point, not the last word for the POC.** Where the product owner has decided differently, the
decision is recorded in [../decisions.md](../decisions.md) and wins over the spec text. Read both together.

## Section index (line numbers in `original-spec.txt`)

| Section | Topic | Line |
|---|---|---|
| 1.2 | Non-negotiable design boundaries | 82 |
| 5.1 / 5.2 | Decision storage; rank-direction strategy | 411 / 438 |
| 8.3 / 8.4 / 8.5 | Underwriting Authority table; **live eligibility predicate**; authority status reasons | 750 / 966 / 969 |
| 9.2 | Referral (parent) table | 1035 |
| 9.5 | Referral Decision table | 1933 |
| 9.7 | Referral Notification outbox (not built in the POC) | 2323 |
| 11.1 / 11.3 | Parent and item **status registers** | 3269 / 3405 |
| 11.2 | Parent-status decision points | 3399 |
| 11.4 | **Item transition matrix** | 3446 |
| 11.5 | Revision architecture | 3593 |
| 11.6 / 11.7 | **Parent aggregation** and truth table | 3616 / 3619 |
| 11.8 | Race-condition controls | 3678 |
| 12.2 | Alternate keys | 3866 |
| 14.4 | Referral Decision dialog | 4221 |
| 16.1 to 16.7 | Plug-ins and Custom APIs; validation order; registration and direct-write guards | 4311 to 4551 |
| 17.x | Power Automate flows (notifications, SharePoint, reminders; not built in the POC) | 4559 |
| 18.x | Identity, roles, teams and field security | 4721 |

Where this repository differs from the spec on purpose (names of Custom APIs, label wording, the two POC teams, the
superseded-item rule, and so on) the difference and its reason are listed in [../decisions.md](../decisions.md) and
[../open-questions.md](../open-questions.md).
