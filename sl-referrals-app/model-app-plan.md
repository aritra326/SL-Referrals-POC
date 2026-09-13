# SL Referrals & Rationale — design

Referral and underwriting-authority approval workbench (POC data model and UI shell).

Generated from `app-spec.json` by `scripts/write-app-spec-doc.js`. **Regenerate rather than
hand-edit** — `app-spec.json` is the source of truth, so a manual edit here is lost on the next
run and silently disagrees with what actually builds.

## Environment

| Setting | Value |
|---|---|
| Environment | https://org6dab580e.crm17.dynamics.com |
| Solution | SLReferralsPOC |
| Publisher prefix | sl |

## Jobs to be done

| Persona | Job to be done | Surfaces that satisfy it |
|---|---|---|
| Referral Underwriter | Create and submit referrals | My Draft Referrals, Referral Main, Referral Item Main |
| Referral Underwriter | Track my active referrals | My Active Referrals, Completed Referrals |
| Referral Approver | Review and decide on assigned referral items | My Approvals, Referral Item Main |
| Referral Manager | Oversee team referrals and approvals | Team Active Referrals, Action Required |
| Referral Auditor | Audit referral decisions and history | Recorded Decisions, Referral Decision Read-only |
| Referral Administrator | Maintain reference and authority data | Referral Reasons, Covers / Sections, Authority Levels, Underwriting Authorities, Countries |
| Referral Administrator | Administer referrals operationally | All Referral Items, Notifications |

## Data model

### Country `sl_country`

Shared country reference data used as referral and authority metadata.

| Column | Type | Notes |
|---|---|---|
| Country Name | Text | primary name |
| ISO Alpha-2 | Text | required |
| ISO Alpha-3 | Text | — |
| Numeric Code | Text | — |

### Authority Level `sl_authoritylevel`

The comparable authority-rank catalogue that gates who may approve a referral item.

| Column | Type | Notes |
|---|---|---|
| Authority Level Name | Text | primary name |
| Level Code | Text | required |
| Comparison Rank | Integer | — |
| Description | Memo | — |
| Can Approve Referrals | Boolean | — |

### Underwriting Authority `sl_underwritingauthority`

One effective-dated authority assignment: a person, product and level that may approve referrals in that window.

| Column | Type | Notes |
|---|---|---|
| Authority Assignment Name | Text | primary name |
| Authority Assignment Number | AutoNumber | — |
| Authority Rank Snapshot | Integer | — |
| Can Approve Referrals Snapshot | Boolean | — |
| Licence Scheme | Choice | required; global choice `sl_licencescheme` |
| Effective From | DateTime | required |
| Effective To | DateTime | — |
| Last Verified On | DateTime | — |
| SharePoint Licence URL | Text | — |
| Authority Matrix URL | Text | — |
| Source System | Text | — |
| Source Record ID | Text | — |
| Restrictions / Notes | Memo | — |
| Snapshot Integrity | Choice | required; global choice `sl_snapshotintegrity` |

### Referral Reason `sl_referralreason`

Reference catalogue of business reasons a referral item can be raised for.

| Column | Type | Notes |
|---|---|---|
| Referral Reason Name | Text | primary name |
| Reason Code | Text | required |
| Detail Template | Choice | required; global choice `sl_detailtemplate` |
| Description | Memo | — |
| Guidance | Memo | — |
| Guidance URL | Text | — |
| Default SLA Days | Integer | — |
| Requires Cover / Section | Boolean | — |
| Requires Supporting Evidence | Boolean | — |
| Display Order | Integer | — |
| Effective From | DateTime | — |
| Effective To | DateTime | — |

### Cover / Section `sl_coversection`

Product-specific cover catalogue that a referral item's reason is applied against.

| Column | Type | Notes |
|---|---|---|
| Cover / Section Name | Text | primary name |
| Cover Code | Text | required |
| Is Leaf | Boolean | — |
| Description | Memo | — |
| External Code | Text | — |
| Display Order | Integer | — |
| Effective From | DateTime | — |
| Effective To | DateTime | — |

### Referral `sl_referral`

The secured parent approval cycle for one Opportunity/Product combination; holds shared customer, broker, underwriting, transaction, risk and financial context.

| Column | Type | Notes |
|---|---|---|
| Referral Number | Text | primary name, auto-number `REF-{SEQNUM:000000}` |
| Client Request ID | Text | — |
| Referral Cycle Number | Integer | — |
| Product Name Snapshot | Text | — |
| Customer / Insured | Customer | — |
| Transaction Type | Choice | required; global choice `sl_transactiontype` |
| Policy Type | Choice | global choice `sl_policytype` |
| Inception / Effective Date | DateTime | — |
| Priority | Choice | required; global choice `sl_priority` |
| Common Business / Risk Description | Memo | — |
| 100% Premium | Money | — |
| Intact Share % | Decimal | — |
| Intact Premium | Money | — |
| Intact NWP | Money | — |
| UK Premium | Money | — |
| Maximum Policy Limit / EML 100% | Decimal | — |
| PL / EML Amount | Decimal | — |
| External Quote Number | Text | — |
| External Quote Version | Text | — |
| External Quote URL | Text | — |
| Policy Reference | Text | — |
| UW Folder URL | Text | — |
| Folder Provisioning Status | Choice | global choice `sl_folderstatus` |
| Authority / Rating Tool URL | Text | — |
| Has Ever Been Submitted | Boolean | — |
| Submitted On | DateTime | — |
| Last Submitted On | DateTime | — |
| Completed On | DateTime | — |
| Total Current Item Count | Integer | — |
| Open Current Item Count | Integer | — |
| Authorised Current Item Count | Integer | — |
| Rejected Current Item Count | Integer | — |
| Cancelled Current Item Count | Integer | — |
| Outcome Summary | Memo | — |
| Cancellation Reason | Memo | — |
| Source System | Choice | required; global choice `sl_sourcesystem` |
| Source Record ID | Text | — |
| Explicitly Cancelled | Boolean | — |

Notes/timeline enabled.

### Referral Item `sl_referralitem`

One atomic Referral Reason applied to one Cover/Section; routes and decides independently of sibling items.

| Column | Type | Notes |
|---|---|---|
| Referral Item Number | Text | primary name, auto-number `RFI-{SEQNUM:000000}` |
| Logical Item ID | Text | — |
| Is Current Revision | Boolean | — |
| Revision Number | Integer | — |
| Sequence | Integer | — |
| Item Summary | Text | — |
| Referral Details | Memo | — |
| Underwriter Rationale | Memo | — |
| Requested Decision / Exception | Memo | — |
| Detail Template Snapshot | Choice | global choice `sl_detailtemplate` |
| Supporting Document URL | Text | — |
| Evidence Notes | Memo | — |
| Required Rank Snapshot | Integer | — |
| Assigned Approver Snapshot | Text | — |
| Selected Authority Level Snapshot | Text | — |
| Selected Authority Rank Snapshot | Integer | — |
| Authority Validation Result | Choice | global choice `sl_authorityvalidationresult` |
| Authority Validated On | DateTime | — |
| Authority Validation Message | Memo | — |
| Due On | DateTime | — |
| Sent On | DateTime | — |
| Review Started On | DateTime | — |
| Responded On | DateTime | — |
| Information Cycle Number | Integer | — |
| Information Response | Memo | — |
| Change Summary | Memo | — |
| Hazard / Appetite Code | Text | — |
| Appetite Breach Detail | Memo | — |
| Requested Limit Amount | Money | — |
| Current Authority Limit | Money | — |
| Proposed Premium | Money | — |
| Technical Premium | Money | — |
| Pricing Rationale | Memo | — |
| Proposed Duration (Months) | Integer | — |
| Maximum Permitted Duration | Integer | — |
| Additional Cover Description | Memo | — |
| Additional Cover Limit | Money | — |
| Clause / Wording Title | Text | — |
| Current Wording | Memo | — |
| Requested Wording | Memo | — |
| US Exposure % | Decimal | — |
| US Exposure Detail | Memo | — |
| Risk Consulting Required | Boolean | — |
| Risk Management Detail | Memo | — |
| Reinsurance Type | Choice | global choice `sl_reinsurancetype` |
| Retention Amount | Money | — |
| Placement Detail | Memo | — |
| Void Cover / Declaration Detail | Memo | — |
| Geography Exception Detail | Memo | — |
| Moratorium Exception Reason | Memo | — |

Notes/timeline enabled.

### Referral Decision `sl_referraldecision`

Immutable evidence of one decision event on a Referral Item; created only through a controlled decision process and never edited afterward.

| Column | Type | Notes |
|---|---|---|
| Decision Number | Text | primary name, auto-number `RFD-{SEQNUM:000000}` |
| Decision Sequence | Integer | — |
| Decision Type | Choice | required; global choice `sl_decisiontype` |
| Decision On | DateTime | — |
| Authority Level Snapshot | Text | — |
| Authority Rank Snapshot | Integer | — |
| Decision Comments | Memo | — |
| Recommendations | Memo | — |
| Conditions | Memo | — |
| Information Requested | Memo | — |
| Rejection Reason | Memo | — |
| Previous Item Status | Text | — |
| New Item Status | Text | — |
| Item Revision Number | Integer | — |
| Onward Approver Snapshot | Text | — |
| Client Request ID | Text | — |

### Referral Participant `sl_referralparticipant`

Additional people who need read access and/or notifications on a Referral without being an owner or approver.

| Column | Type | Notes |
|---|---|---|
| Participant Number | Text | primary name, auto-number `RFP-{SEQNUM:000000}` |
| Participant Role | Choice | required; global choice `sl_participantrole` |
| Notify on Submission | Boolean | — |
| Notify on Information Request | Boolean | — |
| Notify on Decision | Boolean | — |

### Referral Notification `sl_referralnotification`

Durable outbox of asynchronous notification events, for deduplication, retry and failure visibility.

| Column | Type | Notes |
|---|---|---|
| Notification Number | Text | primary name, auto-number `RFN-{SEQNUM:000000}` |
| Event Type | Choice | required; global choice `sl_eventtype` |
| Recipient Email Snapshot | Text | — |
| Template Key | Text | — |
| Payload JSON | Memo | — |
| Deduplication Key | Text | — |
| Send After | DateTime | — |
| Processing Status | Choice | required; global choice `sl_processingstatus` |
| Attempt Count | Integer | — |
| Sent On | DateTime | — |
| Last Error | Memo | — |

### Relationships

| Kind | From | To | Lookup |
|---|---|---|---|
| 1:N | opportunity | sl_referral | sl_opportunityid |
| 1:N | product | sl_referral | sl_productid |
| 1:N | account | sl_referral | sl_brokeraccountid |
| 1:N | contact | sl_referral | sl_brokercontactid |
| 1:N | sl_country | sl_referral | sl_countryid |
| 1:N | systemuser | sl_referral | sl_primaryunderwriterid |
| 1:N | systemuser | sl_referral | sl_submittedbyid |
| 1:N | systemuser | sl_referral | sl_completedbyid |
| 1:N | sl_referral | sl_referralitem | sl_referralid |
| 1:N | sl_referralreason | sl_referralitem | sl_referralreasonid |
| 1:N | sl_coversection | sl_referralitem | sl_coversectionid |
| 1:N | sl_authoritylevel | sl_referralitem | sl_requiredauthoritylevelid |
| 1:N | sl_underwritingauthority | sl_referralitem | sl_authorityassignmentid |
| 1:N | systemuser | sl_referralitem | sl_assignedapproverid |
| 1:N | sl_country | sl_referralitem | sl_requestedgeographyid |
| 1:N | sl_country | sl_referralitem | sl_moratoriumcountryid |
| 1:N | sl_referralitem | sl_referralitem | sl_previousitemid |
| 1:N | sl_referralitem | sl_referralitem | sl_rootitemid |
| 1:N | sl_referralitem | sl_referraldecision | sl_referralitemid |
| 1:N | systemuser | sl_referraldecision | sl_decisionbyid |
| 1:N | sl_underwritingauthority | sl_referraldecision | sl_authorityassignmentid |
| 1:N | sl_underwritingauthority | sl_referraldecision | sl_onwardauthorityassignmentid |
| 1:N | sl_referral | sl_referralparticipant | sl_referralid |
| 1:N | systemuser | sl_referralparticipant | sl_participantuserid |
| 1:N | sl_referral | sl_referralnotification | sl_referralid |
| 1:N | sl_referralitem | sl_referralnotification | sl_referralitemid |
| 1:N | sl_referraldecision | sl_referralnotification | sl_referraldecisionid |
| 1:N | systemuser | sl_referralnotification | sl_recipientuserid |
| 1:N | product | sl_coversection | sl_productid |
| 1:N | sl_coversection | sl_coversection | sl_parentcoverid |
| 1:N | sl_authoritylevel | sl_referralreason | sl_defaultauthoritylevelid |
| 1:N | systemuser | sl_underwritingauthority | sl_underwriterid |
| 1:N | product | sl_underwritingauthority | sl_productid |
| 1:N | sl_authoritylevel | sl_underwritingauthority | sl_authoritylevelid |
| 1:N | sl_country | sl_underwritingauthority | sl_licencelocationid |
| 1:N | systemuser | sl_underwritingauthority | sl_lastverifiedbyid |

## Surfaces

### Generative pages

> ⚠ No generative pages. Per the genpage-first policy, any non-record surface — an overview or
> landing page, a dashboard, an analytics view, a guided/wizard flow — should be a generative
> page rather than a classic dashboard. If this app genuinely has only record CRUD, that's
> fine; otherwise a surface is missing.

### Forms

| Form | Table | Type | Layout | Sub-grids |
|---|---|---|---|---|
| Referral Main | sl_referral | Main | auto | sl_referralitem, sl_referralparticipant |
| Referral Item Main | sl_referralitem | Main | auto | sl_referraldecision |
| Referral Decision Read-only | sl_referraldecision | Main | auto | — |
| Referral Reason Main | sl_referralreason | Main | auto | — |
| Cover / Section Main | sl_coversection | Main | auto | — |
| Authority Level Main | sl_authoritylevel | Main | auto | — |
| Underwriting Authority Main | sl_underwritingauthority | Main | auto | — |
| Referral Participant Main | sl_referralparticipant | Main | auto | — |
| Referral Notification Administration | sl_referralnotification | Main | auto | — |

### Views

| View | Table | Columns | Filters | Sort |
|---|---|---|---|---|
| My Draft Referrals | sl_referral | sl_name, sl_productnamesnapshot, sl_priority, statuscode | sl_primaryunderwriterid eq-userid; statuscode eq Draft | modifiedon desc |
| My Active Referrals | sl_referral | sl_name, statuscode, sl_priority | sl_primaryunderwriterid eq-userid; statuscode ne Draft | — |
| Action Required | sl_referral | sl_name, statuscode, sl_priority, sl_primaryunderwriterid | statuscode in More Information Required/Revision in Progress/Partially Authorised - Underwriter Action Required/Rejected - Underwriter Action Required | — |
| Team Active Referrals | sl_referral | sl_name, statuscode, sl_priority, sl_primaryunderwriterid, ownerid | — | — |
| Completed Referrals | sl_referral | sl_name, statuscode, sl_primaryunderwriterid, sl_outcomesummary | statecode eq 1; all records | sl_completedon desc |
| My Approvals | sl_referralitem | sl_name, sl_referralid, statuscode, sl_referralreasonid, sl_dueon | sl_assignedapproverid eq-userid; statuscode in Sent for Approval/In Review/Resubmitted/Onward for Approval | sl_dueon asc |
| Information Required | sl_referralitem | sl_name, sl_referralid, sl_referralreasonid, sl_assignedapproverid, sl_informationcyclenumber | statuscode eq More Information Required | — |
| All Current Referral Items | sl_referralitem | sl_name, sl_referralid, sl_revisionnumber, statuscode, sl_referralreasonid, sl_dueon | sl_iscurrentrevision eq 1 | — |
| Recorded Decisions | sl_referraldecision | sl_name, sl_referralitemid, sl_decisionsequence, sl_decisiontype, sl_decisionon | — | sl_decisionon desc |
| Referral Reasons Reference List | sl_referralreason | sl_name, sl_reasoncode, sl_detailtemplate, sl_effectivefrom, sl_effectiveto | — | sl_displayorder asc |
| Active Covers by Product | sl_coversection | sl_name, sl_covercode, sl_productid, sl_effectivefrom, sl_effectiveto | sl_isleaf eq 1 | — |
| Current Authorities | sl_underwritingauthority | sl_name, sl_underwriterid, sl_productid, sl_authoritylevelid, sl_effectiveto | statuscode eq Current | — |
| Failed Notifications | sl_referralnotification | sl_name, sl_eventtype, sl_referralid, sl_recipientemail, sl_attemptcount, sl_lasterror | sl_processingstatus eq Failed | — |

## Navigation

- **Referral Workbench**
  - My Work
    - My Draft Referrals → table `sl_referral` — icon: the table's own
    - My Active Referrals → table `sl_referral` — icon: the table's own
  - Approvals
    - My Approvals → table `sl_referralitem` — icon: the table's own
    - Information Required → table `sl_referralitem` — icon: the table's own
    - Action Required → table `sl_referral` — icon: the table's own
  - Team
    - Team Active Referrals → table `sl_referral` — icon: the table's own
  - History
    - Completed Referrals → table `sl_referral` — icon: the table's own
    - All Referral Items → table `sl_referralitem` — icon: the table's own
- **Administration**
  - Reference Data
    - Referral Reasons → table `sl_referralreason` — icon: the table's own
    - Covers / Sections → table `sl_coversection` — icon: the table's own
    - Countries → table `sl_country` — icon: the table's own
  - Authority
    - Authority Levels → table `sl_authoritylevel` — icon: the table's own
    - Underwriting Authorities → table `sl_underwritingauthority` — icon: the table's own
  - Audit
    - Referral Decisions / Audit → table `sl_referraldecision` — icon: the table's own
  - Operations
    - Notifications → table `sl_referralnotification` — icon: the table's own

## Security

### Role: Referral Underwriter

The app is granted to this role, so it opens for this persona.

| Table | Access | Scope |
|---|---|---|
| sl_referral | create, read, write | user |
| sl_referralitem | create, read, write | user |
| sl_referralparticipant | create, read, write | user |
| sl_referralreason | read | organization |
| sl_coversection | read | organization |
| sl_authoritylevel | read | organization |
| sl_underwritingauthority | read | organization |
| sl_country | read | organization |
| product | read | organization |
| opportunity | read, append, appendTo | organization |
| account | read, append, appendTo | organization |
| contact | read, append, appendTo | organization |
| systemuser | read | organization |

### Role: Referral Approver

The app is granted to this role, so it opens for this persona.

| Table | Access | Scope |
|---|---|---|
| sl_referralitem | read, write | user |
| sl_referral | read | user |
| sl_referraldecision | create, read | user |
| sl_underwritingauthority | read | organization |
| sl_authoritylevel | read | organization |
| sl_referralreason | read | organization |
| sl_coversection | read | organization |
| systemuser | read | organization |

### Role: Referral Manager

The app is granted to this role, so it opens for this persona.

| Table | Access | Scope |
|---|---|---|
| sl_referral | read, write | businessUnit |
| sl_referralitem | read, write | businessUnit |
| sl_referralparticipant | read, write | businessUnit |
| sl_referraldecision | read | businessUnit |
| sl_referralreason | read | organization |
| sl_coversection | read | organization |
| sl_authoritylevel | read | organization |
| sl_underwritingauthority | read | organization |
| sl_country | read | organization |
| systemuser | read | organization |

### Role: Referral Auditor

The app is granted to this role, so it opens for this persona.

| Table | Access | Scope |
|---|---|---|
| sl_referral | read | organization |
| sl_referralitem | read | organization |
| sl_referraldecision | read | organization |
| sl_referralparticipant | read | organization |
| sl_referralnotification | read | organization |
| sl_authoritylevel | read | organization |
| sl_underwritingauthority | read | organization |
| sl_referralreason | read | organization |
| sl_coversection | read | organization |
| sl_country | read | organization |

### Role: Referral Administrator

The app is granted to this role, so it opens for this persona.

| Table | Access | Scope |
|---|---|---|
| sl_referralreason | create, read, write, delete | organization |
| sl_coversection | create, read, write, delete | organization |
| sl_authoritylevel | create, read, write, delete | organization |
| sl_underwritingauthority | create, read, write, delete | organization |
| sl_country | create, read, write, delete | organization |
| sl_referral | read, write | organization |
| sl_referralitem | read, write | organization |
| sl_referraldecision | read | organization |
| sl_referralnotification | read, write | organization |
| sl_referralparticipant | read, write | organization |
