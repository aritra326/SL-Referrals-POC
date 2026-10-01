# Referral Item and Referral Decision forms (solution 1.0.0.12)

Source: the ChatGPT design discussion (specification sections 13.3 and 9.5) compared with the forms found in Dev.
Both forms are edited in the **SL_Referrals** solution (publisher SL CRM). Out-of-the-box controls only: tabs, sections, subgrid.
No Quick Views were added; their fields are shown directly instead.

## Referral Item - Main form ("Information", `34d69ff4-...`)

| Tab | Sections | Columns |
|---|---|---|
| General (hidden) | General | Referral Item Title, Owner |
| Summary | Referral context; Approval question; What needs approval | Referral, Product; Referral Reason, Cover / Section, Item Summary, Requested Decision / Exception; Referral Details, Underwriter Rationale |
| Authority & Review | Authority requirement; Current routing; Authority validation | Required Authority Level, Required Rank Snapshot, Selected Authority Assignment; Assigned Approver, Approver Snapshot, Sent On, Review Started On, Due On; Validation Result / Message / On, Selected Level and Rank Snapshots |
| Risk & Evidence (was "Detail Fields", unchanged contents) | Duration, Geography, Limit, Pricing, Reinsurance, Wording | as before |
| **Decisions** (new) | Decision history | Read-only subgrid of Referral Decisions for this item, view **Decisions by Item** (new, newest first) |
| Revision & Lifecycle | Revision Identity, Timeline, Information Requests | as before |
| Documents & Evidence | Supporting Evidence | as before |
| **Administration** (new) | Technical | Current Uniqueness Key, Logical Item ID, Owner, Created On, Modified On |

Header: Item No., Status Reason, Revision Number, Assigned Approver, Due On.

## Referral Decision - Main form ("Information", `8851b329-...`), read-only

Every field is disabled: decisions are created by the Custom APIs and are immutable (see decisions.md, decision 18).

| Tab | Sections | Columns |
|---|---|---|
| Decision | Decision; Subject; Decision narrative; Recommendations; Conditions; Information requested; Rejection reason | Decision Number, Type, On, By, Sequence; Referral Request, Referral Item, Item Revision Number; Decision Comments; Recommendations; Conditions; Information Requested; Rejected Reason |
| Authority | Authority used; Onward routing | Authority Assignment Used, Authority Level Used, Level Snapshot, Rank Snapshot, Can Approve (snapshot); Onward Authority Assignment, Onward Approver Snapshot |
| Audit | Transition; Record evidence | Previous / New Item Status; Correlation ID, Client Request ID, Owner, Created On / By, Status Reason |

Header: Decision Number, Decision Type, Decision On, Decision By.

## Notes

* Deprecated columns (Item: Decision, Decision By/On, Decision Rationale, Recommendations, Selected Underwriting Authority, Sequence, Due Date, Display Order)
  are deliberately **not** placed on the forms.
* Conditions is on the Decision form even though conditional decisions are switched off (`slcrm_EnableConditionalDecision` = false); it stays empty.
* The Quick Create Decision form was not changed.
* Admins still need to tighten the Referral Decision security role to read-only (open-questions.md section 3).
