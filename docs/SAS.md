# Irtaki — System Analysis Specification

---

## 1. Document Information

| Field           | Value                                                                      |
| --------------- | -------------------------------------------------------------------------- |
| Document        | Irtaki — System Analysis Specification (SAS)                               |
| Version         | 1.0                                                                        |
| Status          | Baselined — ready for architecture, database design and API design         |
| Source document | Irtaki SRS v1.0 (Draft)                                                    |
| Prepared by     | Senior System Analyst / Solution Architect                                 |
| Audience        | Software Architect, Backend Lead, Mobile Lead, DBA, QA Lead, Product Owner |
| Scope           | MVP                                                                        |

### 1.1 Purpose

This document transforms the approved Irtaki SRS into system-level specifications. The SRS states **what the business wants**. This document states **what the system must therefore contain**: its entities, states, operations, rules, permissions, data, temporal behaviour and remaining technical decisions.

It is not a re-statement of the SRS. Requirement identifiers from the SRS (`FR-*`, `BR-*`, `VR-*`, `NFR-*`, `AC-*`, `US-*`, `OPEN-*`, `FI-*`, `RISK-*`) are preserved verbatim and reused so that traceability to the SRS is unbroken.

### 1.2 Notation

| Marker            | Meaning                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| ✅ CONFIRMED      | Explicitly required by the SRS, or explicitly decided by the stakeholder during analysis |
| ⚠️ OPEN ISSUE     | Unresolved; requires a decision before or during the affected work                       |
| 💡 RECOMMENDATION | The analyst's technical proposal; not yet authoritative                                  |
| ⏳ OUT OF SCOPE   | Explicitly excluded from the MVP                                                         |
| ❌ SUPERSEDED     | An SRS statement overturned by a later stakeholder decision                              |

### 1.3 Identifier scheme

| Prefix  | Meaning                                       | Origin                                 |
| ------- | --------------------------------------------- | -------------------------------------- |
| `FR-*`  | Functional requirement                        | SRS, extended here                     |
| `BR-*`  | Business rule                                 | SRS, extended here (BR-39+)            |
| `VR-*`  | Validation rule                               | SRS, extended here (VR-28+)            |
| `NFR-*` | Non-functional requirement                    | SRS, extended here (NFR-18+)           |
| `UC-*`  | Use case                                      | SRS (UC-01…10), extended here (UC-11+) |
| `E-*`   | Entity                                        | This document                          |
| `ST-*`  | State model                                   | This document                          |
| `EC-*`  | Edge case                                     | This document                          |
| `ISS-*` | Open issue                                    | This document                          |
| `ADR-*` | Architecture decision                         | This document                          |
| `DEC-*` | Stakeholder decision captured during analysis | This document                          |
| `API-*` | API endpoint group                            | This document                          |

### 1.4 Decision log — stakeholder decisions captured during analysis

These decisions were obtained from the stakeholder during four clarification rounds. They are **authoritative** and, where they conflict with SRS v1.0, they supersede it.

| ID          | Decision                                                                                                                                                                                                                                                                                                              | Supersedes                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **DEC-A01** | The Quran reference dataset, including hizb boundaries, is in MVP scope. Ahzab-completed progress is retained on the individual dashboard.                                                                                                                                                                            | Promotes FI-08                                                  |
| **DEC-A02** | Day boundaries are evaluated in each student's own local timezone.                                                                                                                                                                                                                                                    | —                                                               |
| **DEC-A03** | A reporting week has **6 expected days** for every daily-derived metric. The recitation day feeds only the Weekly Report and `AttendanceRate`.                                                                                                                                                                        | Clarifies FR-WR-01                                              |
| **DEC-A04** | A day is "within a Revision Period" **iff** that day's Daily Report has `type = Revision`. A missing report is never excused by revision.                                                                                                                                                                             | Clarifies BR-27/28/29                                           |
| **DEC-A05** | `full_name` and `gender` are copied onto the User record at join acceptance and survive JoinRequest lifecycle.                                                                                                                                                                                                        | Extends §9.1; closes OPEN-02                                    |
| **DEC-A06** | A new payment cycle opens automatically at each cycle end regardless of payment. Unpaid cycles accumulate as visible arrears. Payment status is **derived at read time**, never stored.                                                                                                                               | Amends §9.7                                                     |
| **DEC-A07** | A Weekly Report exists for every enrolled student every reporting week, including zero-submission students. The first week after acceptance is **prorated from `joined_at`**.                                                                                                                                         | Closes OPEN-07                                                  |
| **DEC-A08** | Daily revision is **obligatory on every memorization day** and is a distinct concept from a Revision Period.                                                                                                                                                                                                          | Clarifies BR-27, §9.6                                           |
| **DEC-A09** | The Admin may reassign a Teacher/Assistant on an existing group. Demotion or deletion of assigned staff is blocked until reassignment.                                                                                                                                                                                | Extends FR-GRP                                                  |
| **DEC-A10** | The Commitment Score is recomputed over the selected period. `weeks elapsed` = reporting weeks intersecting `[period_start, period_end] ∩ [joined_at, today]`.                                                                                                                                                        | Clarifies §9.4.3                                                |
| **DEC-B01** | A Quran reference dataset is available as a ready-to-use JSON file and is the single authority for surah metadata, ayah counts and hizb boundaries.                                                                                                                                                                   | —                                                               |
| **DEC-B02** | Hizb completion is **coverage-based**: the union of all memorized ranges ever submitted.                                                                                                                                                                                                                              | —                                                               |
| **DEC-B03** | An IANA timezone identifier is **persisted on the User record** and is the server-side authority for day boundaries, week boundaries, weekly finalisation and notification scheduling.                                                                                                                                | Refines DEC-A02, VR-10, NFR-16                                  |
| **DEC-B04** | Commitment Score components with a zero denominator are **excluded from the average**. If all four are undefined the score is `null` and the UI shows "not enough data". A component is never treated as 0.                                                                                                           | Clarifies §9.4.3                                                |
| **DEC-B05** | Single at-risk definition: **3 consecutive expected days with no report**. Recitation days are skipped; excused absences count as reported and **break the streak**.                                                                                                                                                  | Reconciles §9.4.1/§9.4.2/AC-15                                  |
| **DEC-B06** | Next due date = **oldest unpaid cycle's** end date. `Due Soon` applies to the **current cycle only**. Out-of-order payment recording is permitted. Total arrears count is displayed.                                                                                                                                  | Extends FR-PAY                                                  |
| **DEC-B07** | A group with enrolled students **cannot be deleted**. A distinct **`Archived`** group state is introduced, separate from the `Open`/`Closed` enrollment toggle.                                                                                                                                                       | Closes OPEN-05; amends §10                                      |
| **DEC-B08** | A `Normal` report with neither memorization nor revision is **accepted** and counts as both `missed_daily_memorization` and `missed_daily_revision`.                                                                                                                                                                  | Extends §9.5                                                    |
| **DEC-B09** | The Assistant sees **join requests and payments only** — no report content, no performance data.                                                                                                                                                                                                                      | Closes OPEN-06                                                  |
| **DEC-B10** | **Soft delete replaces hard delete.** Student removal hides records from all user-facing surfaces; data is retained and Admin-recoverable.                                                                                                                                                                            | ❌ Supersedes BR-05, §8.3; promotes FI-04                       |
| **DEC-C01** | The JSON dataset is the single authority for Quran reference data.                                                                                                                                                                                                                                                    | —                                                               |
| **DEC-C02** | Rejoin = **start fresh**. A re-accepted student begins a new membership with zero coverage and zero history.                                                                                                                                                                                                          | Clarifies BR-04                                                 |
| **DEC-C03** | Archived group: students remain enrolled; reporting stops; the archive date terminates all metric periods; payment cycles stop advancing; un-archiving is Admin-only.                                                                                                                                                 | Extends DEC-B07                                                 |
| **DEC-C04** | Removed students are retained in **historical** aggregates for their period of active membership, and excluded from current-week views and the at-risk list.                                                                                                                                                          | Extends DEC-B10                                                 |
| **DEC-C05** | Applicant Score ties break **first-come-first-served** (oldest request first).                                                                                                                                                                                                                                        | Clarifies FR-REQ-02, AC-05                                      |
| **DEC-C06** | A Pending request on a **closed** group stays reviewable. A Pending request on an **archived** group is **auto-rejected**.                                                                                                                                                                                            | Extends FR-REQ                                                  |
| **DEC-C07** | The Admin authenticates via the same endpoint with seeded credentials, sees report content and performance across all groups, and **cannot remove or demote themselves**.                                                                                                                                             | Extends FR-AUTH, BR-R05                                         |
| **DEC-C08** | The §9.4.3 Commitment Score formula and both dashboard element lists are **approved** as written, with all analysis amendments applied.                                                                                                                                                                               | Closes OPEN-01                                                  |
| **DEC-C09** | A pending applicant sees **status only** — no group details.                                                                                                                                                                                                                                                          | Closes OPEN-08                                                  |
| **DEC-C10** | **Push notifications are IN the MVP.**                                                                                                                                                                                                                                                                                | ❌ Supersedes §2.2 / DEC-024; promotes FI-02; mitigates RISK-02 |
| **DEC-C11** | The NFR-13 sizing target is **left undefined by decision**. Architecture must be scale-agnostic.                                                                                                                                                                                                                      | Closes OPEN-04 as "will not specify"                            |
| **DEC-D01** | The join application captures **which ahzab** the applicant has already memorized (a selection over 1–60), replacing the bare `previous_hizb` integer. The Applicant Score consumes the **count** of that selection, so §9.3 is unchanged. The selection **seeds** the student's memorization coverage on acceptance. | ❌ Amends §9.2, VR-04                                           |
| **DEC-D02** | **VR-14a** adopted: each single report's range must be expressed in mushaf order; direction across days is unconstrained. §9.4.1's "current position" is renamed **`last_memorized_position`** and is an **activity pointer, not a progress pointer**. `active_block` is not added.                                   | Amends §9.4.1                                                   |
| **DEC-D03** | The notification event catalogue (eight events, §22) is adopted as proposed.                                                                                                                                                                                                                                          | Implements DEC-C10                                              |
| **DEC-D04** | Daily reminder fires at **20:00 student-local**; suppressed once submitted, on recitation days, and for archived groups. **Push only.** Per-category muting allowed except for account-critical events.                                                                                                               | Implements DEC-C10                                              |
| **DEC-D05** | Audited actions are **exactly three**: enrollment toggle, group creation, login events. No other action is audited.                                                                                                                                                                                                   | Narrows Phase 15 proposal; raises RISK-08                       |
| **DEC-D06** | **No age restriction** on applicants. `age` is captured for information only.                                                                                                                                                                                                                                         | Closes OPEN-03                                                  |
| **DEC-D07** | An applicant must have **at least 5 ahzab** already memorized. The selection size must be 5–60.                                                                                                                                                                                                                       | ❌ Amends VR-04; closes GAP-09                                  |
| **DEC-D08** | **No control** on unbounded revision periods. Accepted for MVP.                                                                                                                                                                                                                                                       | Closes RISK-04 as accepted                                      |

### 1.5 SRS statements superseded by this document

| SRS statement                                                    | Status                           | Replacement                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BR-05** — removal permanently deletes all reports and payments | ❌ SUPERSEDED (DEC-B10)          | Removal terminates the Membership; records are retained and excluded from all user-facing queries except Admin recovery                           |
| **§8.3** — hard cascade delete including JoinRequest history     | ❌ SUPERSEDED (DEC-B10)          | No cascade delete; JoinRequest history retained                                                                                                   |
| **AC-20** — "permanently deletes all their reports and payments" | ⚠️ REWORDED                      | "…all their reports and payments become inaccessible to every role except Admin recovery." Observable behaviour unchanged; the test remains valid |
| **§2.2** — push notifications out of scope (DEC-024)             | ❌ SUPERSEDED (DEC-C10)          | Notifications are in the MVP (§22)                                                                                                                |
| **§9.2 `previous_hizb`** — integer 1–60                          | ❌ SUPERSEDED (DEC-D01, DEC-D07) | `memorized_ahzab` — a set of hizb numbers over 1–60, cardinality 5–60                                                                             |
| **VR-04** — `previous_hizb` integer 1–60                         | ❌ SUPERSEDED                    | See VR-04a (§15)                                                                                                                                  |
| **§9.4.1 element 2** — "current position"                        | ⚠️ RENAMED (DEC-D02)             | `last_memorized_position` — activity pointer                                                                                                      |
| **FI-02**, **FI-04**, **FI-08**                                  | ➡️ PROMOTED TO MVP               | Notifications, soft delete, hizb-boundary detection                                                                                               |
| **OPEN-01…OPEN-08**                                              | ✅ CLOSED                        | See §1.4                                                                                                                                          |
| **RISK-01**, **RISK-02**                                         | ✅ MITIGATED                     | By DEC-B10 and DEC-C10 respectively                                                                                                               |
| **RISK-04**                                                      | ✅ ACCEPTED                      | By DEC-D08, no control                                                                                                                            |

---

## 2. System Overview

Irtaki is a **record-keeping and follow-up system** for a single Quran memorization center. It does not teach, examine, correct or grade. Recitation occurs on WhatsApp; hizb verification occurs between the student and a colleague; money changes hands in cash. Irtaki records what happened and computes indicators from those records.

The system has three functional pillars:

1. **Enrollment** — a self-registered User applies to a gender-matching open group through a scored multi-step form; an Assistant accepts or rejects; acceptance creates a Membership and starts a payment cycle.
2. **Reporting** — an enrolled Student submits one immutable Daily Report on each of six weekly memorization days, and confirms one auto-computed Weekly Report on the seventh (recitation) day.
3. **Follow-up** — derived indicators (Commitment Score, memorization coverage, at-risk detection, payment arrears) are surfaced to the Teacher, the Assistant and the Student according to a strict scope model.

Two subsystems support these pillars and were added during analysis:

- A **Memorization Progress Engine** (§17.6) that converts submitted ayah ranges into hizb-level coverage using a bundled Quran reference dataset.
- A **Notification Subsystem** (§22) that issues per-user, per-timezone push notifications.

The application is Arabic-only, right-to-left, online-only, and mobile-first.

### 2.1 Governing design tensions

Three tensions shape almost every decision in this document and should be understood before reading further.

| Tension                                                                                                                                                                           | Resolution in this specification                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everything of value is **derived**, but derivations must render in under 3 seconds on 3G (NFR-11) while the population is undefined (DEC-C11).                                    | Derive on read where the input set is bounded by a reporting week; materialise where the input set grows without bound (coverage, finalised weekly reports). See ADR-003, ADR-004, ADR-008.    |
| The day boundary is **per student** (DEC-B03), but reporting weeks, group dashboards and scheduled jobs are **group-level or global**.                                            | The persisted `User.timezone` is the single authority. Group aggregates are computed over _dates_, not instants, so per-student timezones never desynchronise a date-keyed aggregate. See §19. |
| Reports are **immutable and non-backdatable** (BR-21, BR-22), yet the system must remain correct when a group is archived, a student is removed, or a membership begins mid-week. | All metric periods are bounded by `[membership.started_at, min(today, membership.ended_at, group.archived_at)]`. Prorating is the default, not an exception. See §18.2.                        |

---

## 3. System Scope

### 3.1 Inside the system boundary

| Capability                                               | Requirements                     |
| -------------------------------------------------------- | -------------------------------- |
| Email/password registration and authentication           | FR-AUTH-01…06                    |
| Role resolution and role-based routing                   | FR-AUTH-05, BR-R01…R05           |
| Group browsing filtered by gender and enrollment status  | FR-JOIN-03, VR-08                |
| Multi-step join application with automatic scoring       | FR-JOIN-01…12, §9.3              |
| Join request review, acceptance and rejection            | FR-REQ-01…07                     |
| Group creation, staff assignment, reassignment, archival | FR-GRP-01…12                     |
| Daily Report submission (3 types), immutable             | FR-DR-01…10                      |
| Weekly Report auto-computation and student confirmation  | FR-WR-01…07                      |
| Commitment Score, dashboards, at-risk detection          | FR-PERF-01…06, §9.4              |
| Memorization coverage and ahzab-completed tracking       | FR-PROG-01…05 (new)              |
| Offline payment tracking and arrears                     | FR-PAY-01…10                     |
| Push notifications                                       | FR-NOTIF-01…08 (new)             |
| Audit logging (three actions)                            | FR-AUDIT-01…02 (new)             |
| Soft deletion and Admin recovery                         | FR-GRP-08a, FR-ADMIN-01…03 (new) |

### 3.2 Outside the system boundary

| Excluded                                          | Basis                                  |
| ------------------------------------------------- | -------------------------------------- |
| The recitation act, live correction, audio/video  | BR-18, §2.2 ✅ CONFIRMED               |
| Hizb pass/fail verification                       | DEC-014, §2.2 ✅ CONFIRMED             |
| Teacher grading, evaluation, correction, comments | DEC-009, FI-05 ⏳ OUT OF SCOPE         |
| Movement of funds; any payment gateway            | FR-PAY-08, BR-35 ✅ CONFIRMED          |
| Offline mode, local queueing, draft sync          | NFR-02, DEC-026, FI-03 ⏳ OUT OF SCOPE |
| Multi-center / multi-branch                       | FI-09 ⏳ OUT OF SCOPE                  |
| Group capacity limits and waitlists               | BR-09, FI-10 ⏳ OUT OF SCOPE           |
| Chat / messaging between any parties              | FI-16 ⏳ OUT OF SCOPE                  |
| Report editing or deletion by any role            | BR-22, FR-DR-04, FR-WR-07 ✅ CONFIRMED |
| Rejection reasons and applicant feedback          | FR-REQ-06, FI-12 ⏳ OUT OF SCOPE       |
| Cancelling one's own pending request              | FR-JOIN-12, FI-13 ⏳ OUT OF SCOPE      |
| Multiple Admin accounts                           | BR-R05, FI-11 ⏳ OUT OF SCOPE          |
| Languages other than Arabic                       | NFR-03, FI-15 ⏳ OUT OF SCOPE          |
| A user-facing audit log UI                        | DEC-D05 ⏳ OUT OF SCOPE                |
| Email notifications                               | DEC-D04 (push only) ⏳ OUT OF SCOPE    |

### 3.3 External systems and integrations

The SRS names no providers. The following are **required integrations** derived from stated requirements, with the concrete provider left to architecture.

| #      | External system                          | Required by                                       | Nature                                                                               | Status                                 |
| ------ | ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| EXT-01 | Identity / credential store              | NFR-06 ("managed by the authentication provider") | May be an in-house module or a managed provider; the SRS does not say                | ⚠️ OPEN ISSUE — ISS-05                 |
| EXT-02 | Transactional email delivery             | FR-AUTH-04 (password reset by email)              | Mandatory; no provider named                                                         | ⚠️ OPEN ISSUE — ISS-06                 |
| EXT-03 | Push notification transport (FCM / APNs) | DEC-C10, FR-NOTIF-\*                              | Mandatory for MVP                                                                    | ✅ CONFIRMED as required; provider TBD |
| EXT-04 | Quran reference dataset (JSON)           | DEC-C01, VR-13, FR-PROG-\*                        | **Not a runtime integration** — a build-time asset loaded into reference tables      | ✅ CONFIRMED, asset supplied           |
| EXT-05 | WhatsApp                                 | BR-18                                             | **Not an integration.** Recitation happens there; Irtaki neither reads nor writes it | ✅ CONFIRMED out of boundary           |
| EXT-06 | Payment gateway                          | —                                                 | ⏳ OUT OF SCOPE (FR-PAY-08)                                                          | Not integrated                         |

---

## 4. Actors

### 4.1 Human actors

#### A-01 — Admin

| Aspect                | Definition                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**           | Owns the structural configuration of the center: groups, staff, and membership termination.                                                                                           |
| **Account origin**    | Seeded at installation. Not creatable through the UI (BR-R05: exactly one exists).                                                                                                    |
| **Authentication**    | Same endpoint as all other roles, using seeded credentials (DEC-C07).                                                                                                                 |
| **Responsibilities**  | Create groups; assign and reassign Teacher and Assistant; promote Users to Teacher or Assistant; remove Students; archive and un-archive groups; recover soft-deleted data.           |
| **Permissions**       | Full read across the system, including report content and performance for every group (DEC-C07). Write access to Group, staff assignment, role promotion, and membership termination. |
| **Constraints**       | Cannot remove or demote themselves (DEC-C07, BR-R05). Cannot create another Admin. Cannot edit or delete any report.                                                                  |
| **Main interactions** | UC-10, UC-11, UC-12, UC-13, UC-17                                                                                                                                                     |

#### A-02 — User

| Aspect                | Definition                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**           | The default state of any self-registered person; a prospective student.                                                              |
| **Account origin**    | Self-registration (FR-AUTH-01, BR-R02).                                                                                              |
| **Responsibilities**  | Complete a join application; wait for a decision.                                                                                    |
| **Permissions**       | Read own account; read groups that are `Open` **and** gender-matching **and** not `Archived`; create and read own JoinRequest.       |
| **Constraints**       | At most one `Pending` request (BR-01). Cannot cancel it (FR-JOIN-12). Sees status only while pending, never group details (DEC-C09). |
| **Main interactions** | UC-01, UC-02, UC-03                                                                                                                  |

#### A-03 — Student

| Aspect                | Definition                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**           | An enrolled member of exactly one group who produces the system's primary data.                                                                                                           |
| **Account origin**    | Promotion from User on join acceptance (FR-REQ-05).                                                                                                                                       |
| **Responsibilities**  | Submit one Daily Report per memorization day; confirm the Weekly Report on the recitation day; monitor own commitment and payment status.                                                 |
| **Permissions**       | Create and read own Daily Reports; read own Weekly Reports and confirm the attendance checkbox once; read own performance; read own payment status and arrears.                           |
| **Constraints**       | Cannot edit or delete anything they submit (BR-22). Cannot apply to another group while enrolled (BR-03). Cannot submit on a recitation day (FR-DR-06) or for any date but today (BR-21). |
| **Main interactions** | UC-02, UC-05, UC-06, UC-09-Student-view                                                                                                                                                   |

#### A-04 — Assistant

| Aspect                | Definition                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**           | Administrative staff for one or more groups: gatekeeping and fee tracking.                                                                                           |
| **Account origin**    | Promoted from User by Admin (BR-R03).                                                                                                                                |
| **Responsibilities**  | Review, accept and reject join requests for assigned groups; record cash payments; follow up on arrears.                                                             |
| **Permissions**       | Read join requests and full applicant profiles for **assigned groups only**; accept/reject; read payment ledger and record payments for students in assigned groups. |
| **Constraints**       | **No access to report content or performance data whatsoever** (DEC-B09). Cannot change enrollment status. Cannot remove a student. Cannot create groups.            |
| **Main interactions** | UC-04, UC-09                                                                                                                                                         |

#### A-05 — Teacher

| Aspect                | Definition                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**           | Pedagogical lead of one or more groups; consumes indicators to intervene.                                                                                                       |
| **Account origin**    | Promoted from User by Admin (BR-R03).                                                                                                                                           |
| **Responsibilities**  | Monitor group and individual commitment; identify at-risk students; control intake timing.                                                                                      |
| **Permissions**       | Read group and individual dashboards, raw daily reports, and weekly reports for **assigned groups only** (NFR-09, FR-PERF-06). Update the enrollment toggle on assigned groups. |
| **Constraints**       | **The enrollment toggle is the Teacher's only write permission in the entire system** (§10, DEC-009). No grading, no comments, no corrections, no payment access.               |
| **Main interactions** | UC-02, UC-07, UC-08, UC-14                                                                                                                                                      |

### 4.2 Non-human actors

| ID       | Actor                      | Purpose                                                        | Triggers                                                                                                                                                                                                                            |
| -------- | -------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A-06** | **Scheduler**              | Executes time-driven system behaviour that no human initiates. | Weekly Report finalisation at student-local midnight (FR-WR-06); daily reminder dispatch at 20:00 student-local (DEC-D04); payment `Due Soon` transition evaluation; auto-rejection of pending requests on group archival (DEC-C06) |
| **A-07** | **Notification Transport** | Delivers push messages to devices.                             | Invoked by the Notification Subsystem; external (EXT-03)                                                                                                                                                                            |

⚠️ **OPEN ISSUE — ISS-01**: the Scheduler is a first-class actor whose failure is silent. If the finalisation job does not run, weekly reports never finalise and `AttendanceRate` denominators stall. Operational monitoring for it is specified in §25.10 but has no stated target.

### 4.3 Actor–capability summary

| Capability               | Admin       | Teacher       | Assistant     | Student | User                   |
| ------------------------ | ----------- | ------------- | ------------- | ------- | ---------------------- |
| Register / authenticate  | ✅ (seeded) | ✅            | ✅            | ✅      | ✅                     |
| Browse groups            | All         | Assigned      | Assigned      | Own     | Open + gender-matching |
| Apply to a group         | —           | —             | —             | —       | ✅                     |
| Decide a join request    | —           | —             | ✅ (assigned) | —       | —                      |
| Create / archive a group | ✅          | —             | —             | —       | —                      |
| Assign / reassign staff  | ✅          | —             | —             | —       | —                      |
| Toggle enrollment        | —           | ✅ (assigned) | —             | —       | —                      |
| Submit a Daily Report    | —           | —             | —             | ✅      | —                      |
| Confirm a Weekly Report  | —           | —             | —             | ✅      | —                      |
| View report content      | All         | Assigned      | ❌            | Own     | —                      |
| View performance         | All         | Assigned      | ❌            | Own     | —                      |
| Record a payment         | —           | —             | ✅ (assigned) | —       | —                      |
| View payment status      | All         | ❌            | Assigned      | Own     | —                      |
| Remove a student         | ✅          | —             | —             | —       | —                      |
| Recover deleted data     | ✅          | —             | —             | —       | —                      |

---

## 5. System Context

### 5.1 Context diagram

```
                          ┌───────────────────────────┐
     Admin ──────────────▶│                           │
     Teacher ────────────▶│                           │──────▶ EXT-03
     Assistant ──────────▶│      IRTAKI SYSTEM        │        Push transport
     Student ────────────▶│                           │        (FCM / APNs)
     User ───────────────▶│  ┌─────────────────────┐  │
                          │  │ Enrollment          │  │──────▶ EXT-02
                          │  │ Reporting           │  │        Email delivery
     A-06 Scheduler ─────▶│  │ Follow-up           │  │        (password reset)
     (internal, time)     │  │ Progress Engine     │  │
                          │  │ Notification Subsys │  │◀────── EXT-04
                          │  └─────────────────────┘  │        Quran reference JSON
                          └───────────────────────────┘        (build-time asset)

     OUTSIDE THE BOUNDARY — no integration, no data exchange:
       WhatsApp (recitation)      Cash (fees)      Colleague (hizb verification)
```

### 5.2 Data crossing the boundary

| Direction | Data                                                         | Destination / Origin | Sensitivity             |
| --------- | ------------------------------------------------------------ | -------------------- | ----------------------- |
| Out       | Push payload (event type, minimal context, no personal data) | EXT-03               | Low — see BR-46         |
| Out       | Password-reset token and email address                       | EXT-02               | High                    |
| In        | Surah metadata, ayah counts, hizb boundaries                 | EXT-04               | None (public reference) |
| —         | Recitation content, teacher corrections, cash                | Never crosses        | N/A                     |

**BR-46 (new)** — Push notification payloads shall contain an event type and identifiers only. No personal data, report content, score, or payment amount shall appear in a push payload, because push payloads render on a locked screen and traverse a third party.

### 5.3 What the system explicitly does not know

Recognising these gaps prevents false confidence in the data:

| The system does not know                                 | Consequence                                                  | Requirement    |
| -------------------------------------------------------- | ------------------------------------------------------------ | -------------- |
| Whether the recitation actually happened                 | `attended_recitation_call` is self-declared and unverifiable | BR-30, RISK-03 |
| Whether the memorization reported was actually memorized | All report content is self-declared                          | RISK-03        |
| Whether a hizb was passed                                | Verification occurs outside the app                          | DEC-014        |
| Whether cash was actually received                       | Only that an Assistant asserted it                           | BR-35          |
| Why a report is missing                                  | A missing report cannot be excused retroactively             | BR-21, BR-23   |

💡 **RECOMMENDATION** — the Teacher's dashboard should carry a persistent, unobtrusive statement that all figures are self-declared (RISK-03 mitigation). This is a UX requirement, recorded here as **NFR-18**.

---

## 6. Functional Requirements

SRS identifiers are preserved. Requirements added during analysis are marked **NEW** and carry a decision reference.

### 6.1 Authentication and Account (FR-AUTH)

| ID             | Requirement                                                                                                                                                     | Priority | Source            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- |
| FR-AUTH-01     | The system shall allow self-registration with email and password only.                                                                                          | Must     | SRS               |
| FR-AUTH-02     | The system shall assign the role `User` to every newly registered account.                                                                                      | Must     | SRS               |
| FR-AUTH-03     | The system shall authenticate returning users via email and password.                                                                                           | Must     | SRS               |
| FR-AUTH-04     | The system shall provide a password reset flow via email.                                                                                                       | Must     | SRS               |
| FR-AUTH-05     | The system shall route the user to the dashboard corresponding to their role on login.                                                                          | Must     | SRS               |
| **FR-AUTH-06** | The system shall accept authentication for the seeded Admin account through the same endpoint used by all other roles.                                          | Must     | **NEW** — DEC-C07 |
| **FR-AUTH-07** | The system shall capture the client's IANA timezone identifier at registration and refresh it on every authenticated session, persisting it on the User record. | Must     | **NEW** — DEC-B03 |
| **FR-AUTH-08** | The system shall register and persist a push device token per authenticated device, and shall remove it on logout or on transport-reported invalidation.        | Must     | **NEW** — DEC-C10 |

💡 **RECOMMENDATION (not confirmed)** — force a password change on the seeded Admin's first login. Recorded as **ISS-07**; the stakeholder confirmed seeded credentials but not a rotation requirement.

### 6.2 Group Browsing and Join Request (FR-JOIN)

| ID              | Requirement                                                                                                               | Priority | Source            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- |
| FR-JOIN-01      | The system shall present the join process as a multi-step form (stepper).                                                 | Must     | SRS               |
| FR-JOIN-02      | Step 1 shall capture the applicant's gender.                                                                              | Must     | SRS               |
| FR-JOIN-03      | Step 2 shall list only groups whose gender matches the declared gender and whose enrollment status is `Open`.             | Must     | SRS               |
| **FR-JOIN-03a** | The list in FR-JOIN-03 shall additionally exclude groups whose lifecycle state is `Archived`.                             | Must     | **NEW** — DEC-B07 |
| FR-JOIN-04      | Step 3 shall capture the full applicant profile (§24.3).                                                                  | Must     | SRS               |
| **FR-JOIN-04a** | Step 3 shall capture the specific ahzab the applicant has already memorized, as a selection over hizb numbers 1–60.       | Must     | **NEW** — DEC-D01 |
| FR-JOIN-05      | The system shall reject the application if `Program Goal` is not `Memorization`.                                          | Must     | SRS               |
| FR-JOIN-06      | The system shall require explicit agreement to the 30 TND quarterly fee before submission.                                | Must     | SRS               |
| FR-JOIN-07      | The system shall compute an Applicant Score on submission (§18.6).                                                        | Must     | SRS               |
| FR-JOIN-08      | The system shall store the request with status `Pending`.                                                                 | Must     | SRS               |
| FR-JOIN-09      | The system shall prevent a User from holding more than one `Pending` request.                                             | Must     | SRS               |
| FR-JOIN-10      | The system shall prevent a Student from submitting a join request while enrolled.                                         | Must     | SRS               |
| FR-JOIN-11      | The system shall display the current status of a User's pending request.                                                  | Must     | SRS               |
| **FR-JOIN-11a** | The pending-status view shall display status only, and shall not disclose group name, schedule or any other group detail. | Must     | **NEW** — DEC-C09 |
| FR-JOIN-12      | The system shall not provide a cancel action for a pending request.                                                       | Must     | SRS               |

### 6.3 Join Request Management (FR-REQ)

| ID             | Requirement                                                                                                                                         | Priority | Source            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- |
| FR-REQ-01      | The Assistant shall see pending requests for their assigned groups only.                                                                            | Must     | SRS               |
| FR-REQ-02      | The list shall be sorted by Applicant Score, descending.                                                                                            | Must     | SRS               |
| **FR-REQ-02a** | Ties in Applicant Score shall be broken by request creation time, ascending (oldest first).                                                         | Must     | **NEW** — DEC-C05 |
| FR-REQ-03      | The Assistant shall be able to open the full applicant profile.                                                                                     | Must     | SRS               |
| FR-REQ-04      | The Assistant shall accept or reject a request.                                                                                                     | Must     | SRS               |
| FR-REQ-05      | On acceptance, the system shall promote the User to `Student`, bind them to the group, and set the payment cycle start date to the acceptance date. | Must     | SRS               |
| **FR-REQ-05a** | On acceptance, the system shall copy `full_name` and `gender` from the request onto the User record.                                                | Must     | **NEW** — DEC-A05 |
| **FR-REQ-05b** | On acceptance, the system shall seed the new Membership's memorization coverage from the ahzab selection captured in FR-JOIN-04a.                   | Must     | **NEW** — DEC-D01 |
| FR-REQ-06      | On rejection, the system shall set the request status to `Rejected`. No reason is captured.                                                         | Must     | SRS               |
| FR-REQ-07      | A rejected applicant shall be permitted to submit a new request immediately.                                                                        | Must     | SRS               |
| **FR-REQ-08**  | When a group is archived, the system shall automatically reject every `Pending` request targeting that group.                                       | Must     | **NEW** — DEC-C06 |
| **FR-REQ-09**  | A `Pending` request targeting a group whose enrollment status is `Closed` shall remain reviewable and decidable by the Assistant.                   | Must     | **NEW** — DEC-C06 |

### 6.4 Group Management (FR-GRP)

| ID             | Requirement                                                                                                                                                                          | Priority | Source            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------- |
| FR-GRP-01      | The Admin shall create a group specifying name, gender, and recitation day.                                                                                                          | Must     | SRS               |
| FR-GRP-02      | The Admin shall assign exactly one Teacher and one Assistant per group.                                                                                                              | Must     | SRS               |
| FR-GRP-03      | The system shall not permit a group to exist without both a Teacher and an Assistant.                                                                                                | Must     | SRS               |
| FR-GRP-04      | The recitation day shall be immutable after creation.                                                                                                                                | Must     | SRS               |
| FR-GRP-05      | The Teacher shall toggle the group's enrollment status between `Open` and `Closed`.                                                                                                  | Must     | SRS               |
| FR-GRP-06      | The system shall not enforce any maximum student count.                                                                                                                              | Must     | SRS               |
| FR-GRP-07      | The Admin shall remove a Student from a group.                                                                                                                                       | Must     | SRS               |
| FR-GRP-08      | ❌ SUPERSEDED. On removal, the system shall revert the account to `User` and **soft-delete** all of that student's reports, weekly reports and payment records.                      | Must     | DEC-B10           |
| **FR-GRP-08a** | Soft-deleted records shall be excluded from every query issued on behalf of any role other than Admin recovery, and shall remain physically retained.                                | Must     | **NEW** — DEC-B10 |
| **FR-GRP-09**  | The Admin shall reassign the Teacher or Assistant of an existing group.                                                                                                              | Must     | **NEW** — DEC-A09 |
| **FR-GRP-10**  | The system shall block the demotion or removal of a Teacher or Assistant while they are assigned to any non-archived group, and shall state which groups require reassignment first. | Must     | **NEW** — DEC-A09 |
| **FR-GRP-11**  | The Admin shall archive and un-archive a group. Archival is distinct from the enrollment toggle.                                                                                     | Must     | **NEW** — DEC-B07 |
| **FR-GRP-12**  | The system shall prevent deletion of any group that has ever had an enrolled Student.                                                                                                | Must     | **NEW** — DEC-B07 |

### 6.5 Daily Report (FR-DR)

| ID           | Requirement                                                                                                                                     | Priority | Source            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- |
| FR-DR-01     | A Student shall submit at most one Daily Report per calendar date.                                                                              | Must     | SRS               |
| FR-DR-02     | The submission window shall close at midnight in the student's persisted timezone.                                                              | Must     | SRS + DEC-B03     |
| FR-DR-03     | The system shall not permit submission for any date other than the current date.                                                                | Must     | SRS               |
| FR-DR-04     | A submitted report shall be immutable — no edit, no delete.                                                                                     | Must     | SRS               |
| FR-DR-05     | The Student shall select one report type: `Normal`, `Absent`, or `Revision`.                                                                    | Must     | SRS               |
| FR-DR-06     | The system shall not permit a Daily Report on the group's recitation day.                                                                       | Must     | SRS               |
| FR-DR-07     | For `Normal`, the system shall capture memorization range, memorization time, revision range, revision time, repetition flags, and tafsir flag. | Must     | SRS               |
| FR-DR-08     | For `Absent`, the system shall capture a reason: `Sick`, `Studying`, or `Other`.                                                                | Must     | SRS               |
| FR-DR-09     | For `Revision`, the system shall capture the revision range only.                                                                               | Must     | SRS               |
| FR-DR-10     | The Student shall view their own report history.                                                                                                | Must     | SRS               |
| **FR-DR-11** | The system shall reject a Daily Report submitted by a Student whose group lifecycle state is `Archived`.                                        | Must     | **NEW** — DEC-C03 |
| **FR-DR-12** | On accepting a report containing a memorization range, the system shall update the Membership's memorization coverage.                          | Must     | **NEW** — DEC-B02 |

### 6.6 Weekly Report (FR-WR)

| ID           | Requirement                                                                                                                                                                   | Priority | Source            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- |
| FR-WR-01     | The system shall generate the Weekly Report automatically from the daily records of the reporting week.                                                                       | Must     | SRS + DEC-A03     |
| FR-WR-02     | The Weekly Report shall be presented to the Student on the group's recitation day.                                                                                            | Must     | SRS               |
| FR-WR-03     | The system shall display all computed metrics as read-only.                                                                                                                   | Must     | SRS               |
| FR-WR-04     | The only student input shall be the `Attended Recitation Call` checkbox.                                                                                                      | Must     | SRS               |
| FR-WR-05     | Submission shall consist solely of confirming that checkbox.                                                                                                                  | Must     | SRS               |
| FR-WR-06     | If the Weekly Report is not submitted by midnight of the recitation day in the student's persisted timezone, the system shall record `attended = No` and finalise the report. | Must     | SRS + DEC-B03     |
| FR-WR-07     | A finalised Weekly Report shall be immutable.                                                                                                                                 | Must     | SRS               |
| **FR-WR-08** | A Weekly Report shall be produced for every actively enrolled Student for every reporting week, including students who submitted no daily reports.                            | Must     | **NEW** — DEC-A07 |
| **FR-WR-09** | For the reporting week in which a Membership begins, expected days shall be prorated from the membership start date.                                                          | Must     | **NEW** — DEC-A07 |
| **FR-WR-10** | For the reporting week in which a group is archived or a Membership is terminated, expected days shall be truncated at that date.                                             | Must     | **NEW** — DEC-C03 |

### 6.7 Performance Tracking (FR-PERF)

| ID             | Requirement                                                                                                                               | Priority | Source            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- |
| FR-PERF-01     | The Teacher shall access a group dashboard for each assigned group.                                                                       | Must     | SRS               |
| FR-PERF-02     | The Teacher shall access an individual dashboard for each student in their groups.                                                        | Must     | SRS               |
| FR-PERF-03     | All dashboards shall support a period filter: Week, Month, 3 Months, Custom range.                                                        | Must     | SRS               |
| FR-PERF-04     | The Teacher shall open the raw daily report list for any student in their groups.                                                         | Should   | SRS               |
| FR-PERF-05     | The Student shall see their own commitment score and progress.                                                                            | Must     | SRS               |
| FR-PERF-06     | A Teacher shall not access data for groups they are not assigned to.                                                                      | Must     | SRS               |
| **FR-PERF-07** | Every dashboard metric shall be recomputed over the selected period.                                                                      | Must     | **NEW** — DEC-A10 |
| **FR-PERF-08** | The at-risk list shall identify students with three consecutive expected days bearing no report, where excused absences break the streak. | Must     | **NEW** — DEC-B05 |
| **FR-PERF-09** | Historical group aggregates shall include removed students for the portion of the period during which their Membership was active.        | Must     | **NEW** — DEC-C04 |
| **FR-PERF-10** | Current-week views and the at-risk list shall exclude removed students.                                                                   | Must     | **NEW** — DEC-C04 |

### 6.8 Memorization Progress (FR-PROG) — NEW subsystem

| ID             | Requirement                                                                                                                                                                                          | Priority | Source         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- |
| **FR-PROG-01** | The system shall maintain, per Membership, the union of all memorization ranges ever submitted, as a normalised set of disjoint intervals over a canonical ayah ordinal.                             | Must     | DEC-B02        |
| **FR-PROG-02** | The system shall report `ahzab_completed` as the count of ahzab whose full ayah range is contained within that coverage.                                                                             | Must     | DEC-A01        |
| **FR-PROG-03** | The system shall report `last_memorized_position` as the end position of the most recent memorization submission, and shall present it as an activity indicator, not as a linear progress indicator. | Must     | DEC-D02        |
| **FR-PROG-04** | The system shall seed coverage at membership creation from the applicant's declared ahzab selection.                                                                                                 | Must     | DEC-D01        |
| **FR-PROG-05** | The system shall validate every submitted ayah position against the bundled Quran reference dataset.                                                                                                 | Must     | VR-13, DEC-C01 |

### 6.9 Payments (FR-PAY)

| ID            | Requirement                                                                                                                                                                           | Priority | Source            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- |
| FR-PAY-01     | The system shall record a fixed fee of 30 TND per 3-month cycle for every student.                                                                                                    | Must     | SRS               |
| FR-PAY-02     | The first cycle shall begin on the date the User became a Student.                                                                                                                    | Must     | SRS               |
| FR-PAY-03     | The system shall derive a payment status of `Paid`, `Due Soon`, or `Unpaid`.                                                                                                          | Must     | SRS               |
| FR-PAY-04     | Status shall become `Due Soon` 10 days before the cycle end date.                                                                                                                     | Must     | SRS               |
| FR-PAY-05     | The Assistant shall mark a student's cycle as paid.                                                                                                                                   | Must     | SRS               |
| FR-PAY-06     | The Assistant shall view a list of students filtered by payment status.                                                                                                               | Must     | SRS               |
| FR-PAY-07     | The Student shall view their own payment status and next due date.                                                                                                                    | Must     | SRS               |
| FR-PAY-08     | The system shall not process, transfer, or hold funds.                                                                                                                                | Must     | SRS               |
| **FR-PAY-09** | Payment cycles shall advance automatically at each cycle end irrespective of payment, so that unpaid cycles accumulate as arrears.                                                    | Must     | **NEW** — DEC-A06 |
| **FR-PAY-10** | `Due Soon` shall apply only to the current cycle; the student's next due date shall be the end date of the oldest unpaid cycle; the total number of unpaid cycles shall be displayed. | Must     | **NEW** — DEC-B06 |
| **FR-PAY-11** | The Assistant shall be able to record payment for any unpaid cycle irrespective of order.                                                                                             | Must     | **NEW** — DEC-B06 |
| **FR-PAY-12** | Cycle generation shall stop at the date a group is archived or a Membership is terminated.                                                                                            | Must     | **NEW** — DEC-C03 |

### 6.10 Notifications (FR-NOTIF) — NEW subsystem

| ID              | Requirement                                                                                                                                    | Priority | Source   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| **FR-NOTIF-01** | The system shall deliver push notifications for the eight events catalogued in §22.2.                                                          | Must     | DEC-D03  |
| **FR-NOTIF-02** | The daily report reminder shall be dispatched at 20:00 in the recipient's persisted timezone.                                                  | Must     | DEC-D04  |
| **FR-NOTIF-03** | The daily reminder shall be suppressed if the report is already submitted, on the group's recitation day, and for students in archived groups. | Must     | DEC-D04  |
| **FR-NOTIF-04** | Push shall be the only channel.                                                                                                                | Must     | DEC-D04  |
| **FR-NOTIF-05** | A user shall be able to mute any notification category except account-critical categories.                                                     | Must     | DEC-D04  |
| **FR-NOTIF-06** | The system shall classify join-request acceptance, join-request rejection, and group removal as account-critical and non-mutable.              | Must     | DEC-D04  |
| **FR-NOTIF-07** | Notification payloads shall contain no personal data, report content, score or payment amount.                                                 | Must     | BR-46    |
| **FR-NOTIF-08** | The system shall record dispatch outcome per notification for operational diagnosis.                                                           | Should   | 💡 §22.5 |

### 6.11 Audit and Administration (FR-AUDIT, FR-ADMIN) — NEW

| ID              | Requirement                                                                                                            | Priority | Source            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- |
| **FR-AUDIT-01** | The system shall record an audit entry for exactly three actions: enrollment toggle change, group creation, and login. | Must     | DEC-D05           |
| **FR-AUDIT-02** | Each audit entry shall record actor, action, target, timestamp, and prior and new value where applicable.              | Must     | DEC-D05           |
| **FR-ADMIN-01** | The Admin shall recover soft-deleted records for a removed Student.                                                    | Must     | DEC-B10           |
| **FR-ADMIN-02** | The system shall prevent the Admin from removing or demoting their own account.                                        | Must     | DEC-C07           |
| **FR-ADMIN-03** | The Admin shall promote a User to Teacher or Assistant.                                                                | Must     | SRS US-22, BR-R03 |

---

## 7. Business Rules

All SRS business rules are preserved with their original identifiers. Amendments and additions are marked.

### 7.1 Roles

| ID     | Rule                                                                                                            | Status                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| BR-R01 | A person holds exactly one role at any time. Multi-role accounts are not supported.                             | ✅                                                              |
| BR-R02 | Self-registration always produces a `User`. Teacher, Assistant and Admin roles can never be self-selected.      | ✅                                                              |
| BR-R03 | Only the Admin may promote a User to Teacher or Assistant. Only an account with role `User` is eligible.        | ✅ (CON-08 resolved in favour of BR-R03)                        |
| BR-R04 | Role promotion carries no history. A promoted account retains no prior student data in any user-facing surface. | ✅ (reconciled with DEC-B10: data is retained but inaccessible) |
| BR-R05 | Exactly one Admin account exists in the system, and it cannot remove or demote itself.                          | ✅ + DEC-C07                                                    |

### 7.2 Membership

| ID         | Rule                                                                                                                                                                     | Status            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| BR-01      | A User may hold at most one `Pending` join request.                                                                                                                      | ✅                |
| BR-02      | A Student belongs to exactly one group.                                                                                                                                  | ✅                |
| BR-03      | A Student may not apply to another group while enrolled.                                                                                                                 | ✅                |
| BR-04      | A removed Student reverts to `User` and may reapply immediately.                                                                                                         | ✅                |
| BR-05      | ❌ **SUPERSEDED by BR-05a.**                                                                                                                                             | DEC-B10           |
| **BR-05a** | Removal terminates the Membership and soft-deletes all associated daily reports, weekly reports and payment records. Data is retained and recoverable by the Admin only. | **NEW** — DEC-B10 |
| BR-06      | A rejected applicant may reapply immediately, with no cooldown and no reason given.                                                                                      | ✅                |
| **BR-39**  | A User may hold at most one Membership in the `Active` state at any time. Terminated Memberships are unlimited.                                                          | **NEW** — DEC-C02 |
| **BR-40**  | Re-acceptance after removal creates a **new** Membership with zero coverage and zero history. Prior Memberships are never revived, merged or carried forward.            | **NEW** — DEC-C02 |

### 7.3 Groups

| ID        | Rule                                                                                                                                                                                                 | Status                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| BR-07     | A group has exactly one Teacher and exactly one Assistant.                                                                                                                                           | ✅                                                |
| BR-08     | A group is gender-restricted: Men's or Women's.                                                                                                                                                      | ✅                                                |
| BR-09     | A group has no maximum capacity.                                                                                                                                                                     | ✅                                                |
| BR-10     | Only the Teacher may change enrollment status.                                                                                                                                                       | ✅                                                |
| BR-11     | Only the Admin may create a group and assign staff.                                                                                                                                                  | ✅                                                |
| BR-12     | The recitation day is fixed at creation and cannot change.                                                                                                                                           | ✅                                                |
| BR-13     | Groups have no scheduled end date.                                                                                                                                                                   | ✅ (an Admin may archive one at any time — BR-41) |
| **BR-41** | A group has a lifecycle state of `Active` or `Archived`, independent of its `Open`/`Closed` enrollment status. Only the Admin may change it.                                                         | **NEW** — DEC-B07                                 |
| **BR-42** | An archived group accepts no daily reports, produces no weekly reports, advances no payment cycles, appears in no join listing, and auto-rejects all pending requests. Its students remain enrolled. | **NEW** — DEC-C03, DEC-C06                        |
| **BR-43** | A group that has ever had an enrolled Student cannot be deleted.                                                                                                                                     | **NEW** — DEC-B07                                 |
| **BR-44** | A Teacher or Assistant assigned to any non-archived group cannot be demoted or removed until reassigned.                                                                                             | **NEW** — DEC-A09                                 |

### 7.4 Weekly schedule

| ID        | Rule                                                                                                                                                                        | Status            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| BR-14     | Each week contains 6 memorization days and 1 recitation day.                                                                                                                | ✅                |
| BR-15     | The reporting week runs from the day after the recitation day through the following recitation day inclusive.                                                               | ✅                |
| BR-16     | Daily Reports are submitted on memorization days only.                                                                                                                      | ✅                |
| BR-17     | The Weekly Report is submitted on the recitation day only.                                                                                                                  | ✅                |
| BR-18     | The recitation itself occurs on WhatsApp and is not recorded in the application.                                                                                            | ✅                |
| **BR-45** | For every daily-derived metric, the expected-day count of a full reporting week is **6**. The recitation day contributes only to the Weekly Report and to `AttendanceRate`. | **NEW** — DEC-A03 |

### 7.5 Reporting

| ID         | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Status                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| BR-19      | One Daily Report per student per date.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅                             |
| BR-20      | Submission closes at midnight in the student's persisted timezone.                                                                                                                                                                                                                                                                                                                                                                                                                       | ✅ + DEC-B03                   |
| BR-21      | Backdated submission is prohibited.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ✅                             |
| BR-22      | Reports are immutable once submitted.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | ✅                             |
| BR-23      | A missing Daily Report counts as one missed occurrence across all applicable weekly metrics.                                                                                                                                                                                                                                                                                                                                                                                             | ✅                             |
| BR-24      | Days marked `Absent — Sick` or `Absent — Studying` are excluded from all weekly calculations.                                                                                                                                                                                                                                                                                                                                                                                            | ✅                             |
| BR-25      | Days marked `Absent — Other` count as a miss.                                                                                                                                                                                                                                                                                                                                                                                                                                            | ✅                             |
| BR-26      | 50 repetitions of the newly memorized portion are required each memorization day. Fixed system-wide.                                                                                                                                                                                                                                                                                                                                                                                     | ✅                             |
| BR-27      | During a Revision Period, missed memorization does not count against the student.                                                                                                                                                                                                                                                                                                                                                                                                        | ✅ (operationalised by BR-28a) |
| BR-28      | A Revision Period is implicit: submitting Revision-type reports signals it. No declaration or approval step exists.                                                                                                                                                                                                                                                                                                                                                                      | ✅                             |
| **BR-28a** | A day is within a Revision Period **iff** that day's Daily Report has `type = Revision`. A day with no report is never within a Revision Period.                                                                                                                                                                                                                                                                                                                                         | **NEW** — DEC-A04              |
| BR-29      | A Revision Period ends implicitly when the student resumes Normal reports.                                                                                                                                                                                                                                                                                                                                                                                                               | ✅                             |
| BR-30      | `Attended Recitation Call` is self-declared and unverified.                                                                                                                                                                                                                                                                                                                                                                                                                              | ✅                             |
| **BR-47**  | **Daily revision is obligatory on every expected day** and is a distinct obligation from memorization. Daily revision is a small consolidation quantity performed alongside memorization; a Revision Period is a phase in which the volume is larger and the focus shifts from memorization to revision. A `Revision`-type day satisfies daily revision **and** excuses memorization. A `Normal`-type day with no revision is a `missed_daily_revision` even when memorization occurred. | **NEW** — DEC-A08              |
| **BR-48**  | A `Normal` report bearing neither memorization nor revision is accepted and counts as a miss on both.                                                                                                                                                                                                                                                                                                                                                                                    | **NEW** — DEC-B08              |
| **BR-49**  | There is no limit on consecutive Revision-type days. Unbounded revision is accepted for the MVP.                                                                                                                                                                                                                                                                                                                                                                                         | **NEW** — DEC-D08              |

### 7.6 Progress

| ID        | Rule                                                                                                                                                                                                                                        | Status                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **BR-50** | Memorization order is unconstrained. A student may proceed forward, backward, from a middle point in either direction, or skip an already-memorized stretch and resume elsewhere. The system models **what is covered**, never a direction. | **NEW** — DEC-D01/D02      |
| **BR-51** | A hizb is complete when every ayah within its boundaries is contained in the student's coverage.                                                                                                                                            | **NEW** — DEC-B02          |
| **BR-52** | Within a single report, a range must be expressed in mushaf order. Direction across days is unconstrained.                                                                                                                                  | **NEW** — DEC-D02 (VR-14a) |
| **BR-53** | Coverage is seeded at membership creation from the applicant's declared ahzab selection and thereafter accumulates from submitted memorization ranges only.                                                                                 | **NEW** — DEC-D01          |

### 7.7 Payments

| ID        | Rule                                                                                              | Status                            |
| --------- | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| BR-31     | The fee is fixed at 30 TND per 3-month cycle, identical for every student.                        | ✅                                |
| BR-32     | The first cycle starts on the date of join acceptance.                                            | ✅                                |
| BR-33     | Status becomes `Due Soon` 10 days before cycle end.                                               | ✅                                |
| BR-34     | Only the Assistant may record a payment.                                                          | ✅                                |
| BR-35     | Payment is tracked, never processed.                                                              | ✅                                |
| **BR-54** | Cycles advance automatically at each cycle end irrespective of payment. Unpaid cycles accumulate. | **NEW** — DEC-A06                 |
| **BR-55** | `Due Soon` is a property of the current cycle only. Older unpaid cycles are simply unpaid.        | **NEW** — DEC-B06                 |
| **BR-56** | A cycle may be paid at most once, and cycles may be paid out of order.                            | **NEW** — DEC-B06 (extends VR-26) |

### 7.8 Applications

| ID        | Rule                                                                                                                    | Status            |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| BR-36     | Only applicants whose Program Goal is `Memorization` may apply.                                                         | ✅                |
| BR-37     | Agreement to the fee is mandatory.                                                                                      | ✅                |
| BR-38     | The Applicant Score is computed automatically and is not editable.                                                      | ✅                |
| **BR-57** | An applicant must declare at least 5 already-memorized ahzab to be eligible.                                            | **NEW** — DEC-D07 |
| **BR-58** | Applicant age is captured for information only and is not subject to any eligibility limit.                             | **NEW** — DEC-D06 |
| **BR-59** | The Applicant Score is a sorting aid only. It never auto-accepts or auto-rejects. Ties resolve first-come-first-served. | ✅ §9.3 + DEC-C05 |

### 7.9 Notifications and audit

| ID        | Rule                                                                                                                      | Status                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **BR-60** | Notifications are informational. No business outcome depends on delivery, and non-delivery never excuses a missed report. | **NEW** — 💡, consistent with BR-21/BR-23 |
| **BR-61** | Account-critical notifications (join accepted, join rejected, removed from group) cannot be muted.                        | **NEW** — DEC-D04                         |
| **BR-62** | Exactly three actions are audited: enrollment toggle, group creation, login.                                              | **NEW** — DEC-D05                         |

---

## 8. Domain Model

### 8.1 Method

An entity is justified here only if it satisfies at least one of: it has **independent identity**, an **independent lifecycle**, or an **independent cardinality** from any candidate parent. Concepts failing all three are modelled as value objects or derived values. The SRS names several concepts that do **not** become entities; those exclusions are argued as explicitly as the inclusions.

### 8.2 Entities — justified

| ID       | Entity                         | Justification                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E-01** | **User**                       | Independent identity (email), independent lifecycle (registration → role transitions), and the anchor of authentication. Holds role, name, gender, timezone and notification preferences.                                                                                                                                                                                                     |
| **E-02** | **Group**                      | Independent identity, independent lifecycle (`Active`/`Archived` × `Open`/`Closed`), owns the recitation day that defines every member's reporting week.                                                                                                                                                                                                                                      |
| **E-03** | **Membership**                 | **Required, not optional.** Under DEC-B10 (soft delete) and DEC-C02 (rejoin starts fresh), a User may have several successive enrollments whose reports and payments must not merge. `User.group_id` cannot express "was enrolled, no longer is, records retained, and a later enrollment is separate." All reporting and payment data therefore hangs off Membership, not User. See ADR-001. |
| **E-04** | **JoinRequest**                | Independent identity, independent lifecycle (`Pending` → `Accepted`/`Rejected`), unbounded cardinality per User, and it carries the applicant profile which outlives the decision.                                                                                                                                                                                                            |
| **E-05** | **DailyReport**                | Independent identity, unbounded cardinality per Membership, and an immutable lifecycle of its own.                                                                                                                                                                                                                                                                                            |
| **E-06** | **WeeklyReport**               | Independent identity and a **distinct lifecycle** from DailyReport: it is generated, presented, then finalised — and finalisation may be performed by the Scheduler rather than the Student. It is not merely a view over daily reports because `attended_recitation_call` is data that exists nowhere else.                                                                                  |
| **E-07** | **PaymentRecord**              | Independent identity, records an assertion by a named Assistant at a point in time. Note: this entity records **payment events only**; payment _cycles_ are derived (§8.4). See ADR-006.                                                                                                                                                                                                      |
| **E-08** | **MemorizationCoverage**       | A persisted projection owned by Membership: the normalised set of disjoint covered intervals. It has a lifecycle independent of any single report (it merges, absorbs and never shrinks) and would otherwise require replaying every report on every dashboard render. See ADR-008.                                                                                                           |
| **E-09** | **DeviceToken**                | Independent identity and lifecycle (registered → invalidated by transport), many per User. Required by DEC-C10.                                                                                                                                                                                                                                                                               |
| **E-10** | **NotificationPreference**     | Per user, per category mute state. Small but independently mutable and queried by the Scheduler. Could be an attribute set on User; kept separate because the category list will grow.                                                                                                                                                                                                        |
| **E-11** | **NotificationLog**            | Dispatch outcome per notification. Independent identity, write-once. FR-NOTIF-08 (Should).                                                                                                                                                                                                                                                                                                    |
| **E-12** | **AuditEntry**                 | Write-once record of the three audited actions. Independent identity and retention.                                                                                                                                                                                                                                                                                                           |
| **E-13** | **Surah** _(reference)_        | Static reference data from EXT-04: number, Arabic name, ayah count, and the ordinal offset used by the coverage model.                                                                                                                                                                                                                                                                        |
| **E-14** | **HizbBoundary** _(reference)_ | Static reference data from EXT-04: hizb number 1–60 with start and end ayah positions.                                                                                                                                                                                                                                                                                                        |

### 8.3 Concepts that are deliberately **not** entities

| Concept                                   | Why not an entity                                                                                                                                                                                                                                                                                                                                                      | Modelled as                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Student / Teacher / Assistant / Admin** | These are values of `User.role` (BR-R01: exactly one role at a time). No sub-type has attributes or a lifecycle the base type lacks. Sub-typing would create four tables that are always empty of distinguishing data.                                                                                                                                                 | `Role` enum on E-01                   |
| **MemorizationRecord**                    | §9.5 caps a `Normal` report at **exactly one** memorization range. It has no identity beyond its parent, no lifecycle (immutable with the parent), and 1:0..1 cardinality. Creating a child table buys nothing and costs a join on the hottest read path. **However** — see §17.4, where the _coverage projection_ (E-08) is separated for entirely different reasons. | Embedded value object on E-05         |
| **RevisionRecord**                        | Identical argument. One revision range per report, immutable, 1:0..1.                                                                                                                                                                                                                                                                                                  | Embedded value object on E-05         |
| **RevisionPeriod**                        | BR-28/BR-28a make it _implicit_: a day is in a revision period iff that day's report type is `Revision`. It has no start date, no end date, no approval, no identity, and no stored representation. Materialising it would require inventing lifecycle rules the business explicitly declined (DEC-A04, DEC-D08).                                                      | Derived predicate over E-05           |
| **PaymentCycle**                          | Fully determined by `membership.started_at` and elapsed time: cycle _i_ spans `started_at + 3i months` to `started_at + 3(i+1) months − 1 day`. Persisting cycles would require a generation job and would duplicate arithmetic. Only _payments_ carry information.                                                                                                    | Derived value object (§8.4), ADR-006  |
| **CommitmentScore**                       | Derived from daily and weekly reports over a caller-supplied period (DEC-A10). Persisting it would be wrong the moment the period filter changes.                                                                                                                                                                                                                      | Derived value object (§18.3)          |
| **ApplicantScore**                        | Derived from JoinRequest fields at submission time. **Persisted as a snapshot** on E-04 because the formula may change and historical ordering must remain reproducible — but it is not an entity.                                                                                                                                                                     | Computed attribute on E-04            |
| **PaymentStatus**                         | Time-dependent (`Due Soon` shifts daily). Storing it would demand a nightly job for no benefit.                                                                                                                                                                                                                                                                        | Derived value object (§18.5), DEC-A06 |
| **Attendance**                            | A single boolean on E-06.                                                                                                                                                                                                                                                                                                                                              | Attribute                             |
| **AtRiskFlag**                            | Derived from the last three expected days (DEC-B05).                                                                                                                                                                                                                                                                                                                   | Derived predicate (§18.4)             |

### 8.4 Value objects

| ID        | Value object        | Definition                                                                                                                                                                                | Used by    |
| --------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **VO-01** | `AyahPosition`      | `(surah_number, ayah_number)` with a derived canonical `ordinal` in `1..T`, where T is the total ayah count in the reference dataset. Equality and ordering are by ordinal.               | E-05, E-08 |
| **VO-02** | `AyahRange`         | `[start: AyahPosition, end: AyahPosition]` with `end.ordinal ≥ start.ordinal` (BR-52).                                                                                                    | E-05, E-08 |
| **VO-03** | `TimeWindow`        | `[from: Time, to: Time]` with `to > from` (VR-15). Local wall-clock times, no date component.                                                                                             | E-05       |
| **VO-04** | `ReportingWeek`     | `[start_date, end_date]` where `end_date` is a recitation-day date and `start_date = end_date − 6 days` (BR-15). Derived from the group's recitation day and the student's timezone.      | E-06, §18  |
| **VO-05** | `PaymentCycle`      | `(index, start_date, end_date, amount=30 TND)`. Derived, never stored.                                                                                                                    | §18.5      |
| **VO-06** | `CommitmentScore`   | `(submission_rate?, memorization_rate?, revision_rate?, attendance_rate?, value?)` where each component is nullable and `value` is the mean of the defined components, or null (DEC-B04). | §18.3      |
| **VO-07** | `CoverageSet`       | An ordered set of disjoint, non-adjacent `AyahRange` intervals. Closed under union.                                                                                                       | E-08       |
| **VO-08** | `ApplicantProfile`  | The immutable snapshot of applicant-declared data captured on E-04.                                                                                                                       | E-04       |
| **VO-09** | `DayClassification` | One of `NO_REPORT`, `NORMAL`, `REVISION`, `ABSENT_EXCUSED`, `ABSENT_OTHER`. The single input to every weekly metric.                                                                      | §18.1      |

### 8.5 Aggregates and ownership

| Aggregate root  | Contained                                                      | Invariant enforced at the root                                                                   |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **User**        | DeviceToken, NotificationPreference                            | Exactly one role; exactly one Admin system-wide; at most one Active Membership                   |
| **Group**       | — (staff are references to User)                               | Exactly one Teacher and one Assistant, both non-null, correctly-roled; recitation day immutable  |
| **Membership**  | DailyReport, WeeklyReport, PaymentRecord, MemorizationCoverage | One DailyReport per date; one WeeklyReport per reporting week; one PaymentRecord per cycle index |
| **JoinRequest** | ApplicantProfile                                               | At most one Pending per User; score immutable after creation                                     |

**Critical ownership consequence** — every report, payment and coverage row is owned by a **Membership**, not by a User. This single choice is what makes DEC-B10 (soft delete), DEC-C02 (fresh rejoin) and DEC-C04 (historical aggregates by active period) all fall out naturally instead of requiring special-case logic in every query.

### 8.6 Domain model diagram

```
                    ┌────────────────────────┐
                    │        USER (E-01)     │
                    │  role, name, gender,   │
                    │  timezone, email       │
                    └───┬────────┬────────┬──┘
        1               │        │        │  1
        │               │ 1      │ 1      └──────────────┐
        │ 0..N          │ 0..N   │ 0..N                  │ 0..N
        ▼               ▼        ▼                       ▼
┌───────────────┐  ┌─────────────────┐        ┌────────────────────┐
│ JOINREQUEST   │  │ DEVICETOKEN     │        │ NOTIFPREFERENCE    │
│    (E-04)     │  │    (E-09)       │        │      (E-10)        │
│ profile,score │  └─────────────────┘        └────────────────────┘
│ status        │
└───────┬───────┘        ┌──────────────────────────────┐
        │ N              │        MEMBERSHIP (E-03)     │
        │                │  user_id, group_id,          │
        │                │  started_at, ended_at, state │
        ▼ 1              └──┬────────┬────────┬─────┬───┘
┌────────────────────┐   1  │      1 │      1 │   1 │
│    GROUP (E-02)    │◀─────┘  0..N  │  0..N  │ 0..N│ 1
│ name, gender,      │  N            ▼        ▼     ▼
│ recitation_day,    │      ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
│ enrollment_status, │      │ DAILYREPORT │ │ WEEKLYREPORT │ │  PAYMENT     │
│ lifecycle_state,   │      │   (E-05)    │ │    (E-06)    │ │  RECORD      │
│ teacher_id,        │      │ date, type, │ │ week, metrics│ │   (E-07)     │
│ assistant_id       │      │ memo range, │ │ attended,    │ │ cycle_index, │
└────────────────────┘      │ rev range,  │ │ finalised_at │ │ paid_at,     │
   ▲          ▲             │ flags       │ └──────────────┘ │ recorded_by  │
   │ teacher  │ assistant   └──────┬──────┘                  └──────────────┘
   └──────────┴── USER              │ feeds
                                    ▼
                          ┌──────────────────────┐
                          │ MEMORIZATIONCOVERAGE │  ┌──────────────┐
                          │        (E-08)        │  │ SURAH (E-13) │
                          │ disjoint intervals   │─▶│ HIZB  (E-14) │
                          │ per membership       │  │  reference   │
                          └──────────────────────┘  └──────────────┘

     Cross-cutting, not owned by any aggregate:
       AUDITENTRY (E-12)        NOTIFICATIONLOG (E-11)
```

---

## 9. Entity Definitions

### E-01 — User

**Purpose.** The identity anchor. Holds credentials, role, personal identity, timezone and notification settings. Exists from registration onwards and is never deleted.

| Attribute       | Type          | Req. | Notes                                                                               |
| --------------- | ------------- | ---- | ----------------------------------------------------------------------------------- |
| `id`            | UUID          | Yes  | PK                                                                                  |
| `email`         | String        | Yes  | Unique, RFC-5322 (VR-01)                                                            |
| `password_hash` | String        | Yes  | NFR-06                                                                              |
| `role`          | Enum          | Yes  | `Admin` / `User` / `Student` / `Teacher` / `Assistant`                              |
| `full_name`     | String        | No   | Copied from JoinRequest on acceptance (DEC-A05). Null for a User who never enrolled |
| `gender`        | Enum          | No   | `Male` / `Female`. Copied on acceptance (DEC-A05, closes OPEN-02)                   |
| `timezone`      | String (IANA) | Yes  | e.g. `Africa/Tunis`. Captured at registration, refreshed each session (DEC-B03)     |
| `created_at`    | Timestamp     | Yes  | UTC                                                                                 |
| `deleted_at`    | Timestamp     | No   | Reserved; users are never deleted in MVP                                            |

⚠️ Note: the SRS §9.1 attributes `group_id` and `joined_at` are **removed** from User and relocated to Membership (E-03). Retaining them would create two sources of truth for enrollment.

**Relationships.** `User 1 → 0..N JoinRequest` · `User 1 → 0..N Membership` (≤1 Active) · `User 1 → 0..N DeviceToken` · `User 1 → 0..N NotificationPreference` · `User 1 → 0..N Group` as teacher · `User 1 → 0..N Group` as assistant.

**Lifecycle.** See ST-01.

**Business rules.** BR-R01…R05, BR-39, BR-44, BR-58.

**Validation.** VR-01, VR-02, VR-28, VR-29.

| Operation | Who                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------- |
| Create    | Self (registration); Admin (seeded at install only)                                            |
| Read      | Self (own); Admin (all); Teacher/Assistant see only name+gender of students in assigned groups |
| Update    | Self (own credentials, timezone, notification prefs); Admin (role promotion only)              |
| Delete    | Nobody                                                                                         |

---

### E-02 — Group

**Purpose.** The organisational unit. Owns the recitation day, which defines every member's reporting week, and the gender restriction that gates applications.

| Attribute           | Type      | Req. | Notes                                                    |
| ------------------- | --------- | ---- | -------------------------------------------------------- |
| `id`                | UUID      | Yes  | PK                                                       |
| `name`              | String    | Yes  |                                                          |
| `gender`            | Enum      | Yes  | `Male` / `Female` (BR-08)                                |
| `recitation_day`    | Enum      | Yes  | Day of week. **Write-once** (BR-12, VR-25)               |
| `enrollment_status` | Enum      | Yes  | `Open` / `Closed`. Default `Closed` (UC-10)              |
| `lifecycle_state`   | Enum      | Yes  | `Active` / `Archived`. Default `Active` (BR-41)          |
| `archived_at`       | Date      | No   | Set on archival; terminates all metric periods (DEC-C03) |
| `teacher_id`        | UUID      | Yes  | FK → User with role `Teacher` (VR-24)                    |
| `assistant_id`      | UUID      | Yes  | FK → User with role `Assistant` (VR-24)                  |
| `created_by`        | UUID      | Yes  | FK → User (Admin)                                        |
| `created_at`        | Timestamp | Yes  |                                                          |

**Relationships.** `Group 1 → 0..N Membership` · `Group 1 → 0..N JoinRequest` · `Group N → 1 User` (teacher) · `Group N → 1 User` (assistant).

**Lifecycle.** See ST-02 (two orthogonal dimensions).

**Business rules.** BR-07…BR-13, BR-41, BR-42, BR-43, BR-44.

**Validation.** VR-23, VR-24, VR-25, VR-30, VR-31.

| Operation | Who                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Create    | Admin                                                                                                 |
| Read      | Admin (all); Teacher/Assistant (assigned); Student (own); User (Open + Active + gender-matching only) |
| Update    | Admin (name, staff, lifecycle); Teacher (enrollment toggle only, own groups)                          |
| Delete    | Admin, and only if the group has never had a Membership (BR-43)                                       |

---

### E-03 — Membership

**Purpose.** One episode of a User's enrollment in a Group. Owns all reporting, payment and progress data for that episode. Introduced during analysis; see §8.2 and ADR-001.

| Attribute         | Type | Req. | Notes                                                                          |
| ----------------- | ---- | ---- | ------------------------------------------------------------------------------ |
| `id`              | UUID | Yes  | PK                                                                             |
| `user_id`         | UUID | Yes  | FK → User                                                                      |
| `group_id`        | UUID | Yes  | FK → Group                                                                     |
| `join_request_id` | UUID | Yes  | FK → JoinRequest that produced it                                              |
| `state`           | Enum | Yes  | `Active` / `Terminated`                                                        |
| `started_at`      | Date | Yes  | Acceptance date. Drives payment cycles (BR-32) and metric prorating (FR-WR-09) |
| `ended_at`        | Date | No   | Removal date. Truncates all metric periods (FR-WR-10)                          |
| `ended_by`        | UUID | No   | FK → User (Admin)                                                              |

**Relationships.** `Membership N → 1 User` · `Membership N → 1 Group` · `Membership 1 → 0..N DailyReport` · `1 → 0..N WeeklyReport` · `1 → 0..N PaymentRecord` · `1 → 1 MemorizationCoverage`.

**Lifecycle.** See ST-03.

**Business rules.** BR-02, BR-04, BR-05a, BR-39, BR-40.

**Validation.** VR-32 (at most one Active per user), VR-33 (group gender must equal user gender at creation).

| Operation | Who                                                               |
| --------- | ----------------------------------------------------------------- |
| Create    | Assistant (as the effect of accepting a join request — FR-REQ-05) |
| Read      | Admin (all); Teacher/Assistant (assigned groups); Student (own)   |
| Update    | Admin (termination only). No other field is mutable               |
| Delete    | Nobody (BR-05a — terminate, never delete)                         |

**Effective metric window.** For any Membership _m_, all metric computations are bounded by:

```
[ m.started_at ,  min( today , m.ended_at ?? ∞ , m.group.archived_at ?? ∞ ) ]
```

This one expression implements FR-WR-09, FR-WR-10, DEC-C03 and DEC-C04 simultaneously.

---

### E-04 — JoinRequest

**Purpose.** A User's application to a specific Group, carrying the applicant profile and the computed score. Survives its own decision and outlives any Membership it produces.

| Attribute                | Type                 | Req. | Notes                                                                                |
| ------------------------ | -------------------- | ---- | ------------------------------------------------------------------------------------ | --------------- | -------------------------------------- |
| `id`                     | UUID                 | Yes  | PK                                                                                   |
| `user_id`                | UUID                 | Yes  | FK → User                                                                            |
| `group_id`               | UUID                 | Yes  | FK → Group, selected at step 2                                                       |
| `full_name`              | String               | Yes  | 3–80 chars                                                                           |
| `gender`                 | Enum                 | Yes  | Must equal the group's gender (VR-08)                                                |
| `age`                    | Integer              | Yes  | Informational only; no eligibility limit (BR-58, DEC-D06)                            |
| `phone_number`           | String               | Yes  | Tunisian format (VR-05)                                                              |
| `occupation`             | String               | Yes  | Restricted visibility (NFR-10)                                                       |
| `city`                   | String               | Yes  | Restricted visibility (NFR-10)                                                       |
| `memorized_ahzab`        | Set\<Integer 1..60\> | Yes  | ❌ Replaces `previous_hizb` (DEC-D01). Cardinality 5–60 (BR-57)                      |
| `memorized_hizb_count`   | Integer              | Yes  | Derived = `                                                                          | memorized_ahzab | `. Persisted for score reproducibility |
| `tajweed_level`          | Enum                 | Yes  | `Beginner` / `Intermediate` / `Advanced`                                             |
| `studied_tajweed_theory` | Boolean              | Yes  |                                                                                      |
| `studied_qalun`          | Boolean              | Yes  |                                                                                      |
| `fee_agreement`          | Boolean              | Yes  | Must be `true` (VR-06)                                                               |
| `program_goal`           | Enum                 | Yes  | Must be `Memorization` (VR-07)                                                       |
| `score`                  | Decimal              | Yes  | Computed at submission, immutable (BR-38)                                            |
| `status`                 | Enum                 | Yes  | `Pending` / `Accepted` / `Rejected`                                                  |
| `resolution_source`      | Enum                 | No   | `Assistant` / `System`. `System` when auto-rejected on group archival (FR-REQ-08) 💡 |
| `created_at`             | Timestamp            | Yes  | Tie-break key (FR-REQ-02a)                                                           |
| `reviewed_at`            | Timestamp            | No   |                                                                                      |
| `reviewed_by`            | UUID                 | No   | FK → User (Assistant)                                                                |
| `deleted_at`             | Timestamp            | No   | Soft delete on student removal (BR-05a)                                              |

**Relationships.** `JoinRequest N → 1 User` · `N → 1 Group` · `1 → 0..1 Membership`.

**Lifecycle.** See ST-04.

**Business rules.** BR-01, BR-06, BR-36, BR-37, BR-38, BR-57, BR-58, BR-59.

**Validation.** VR-03…VR-09, VR-04a, VR-34.

| Operation | Who                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| Create    | User (own, when not enrolled and holding no Pending request)                                                     |
| Read      | Applicant (own — **status only** while pending, DEC-C09); Assistant (assigned groups, full profile); Admin (all) |
| Update    | Assistant (status only, Pending → Accepted/Rejected); System (auto-rejection)                                    |
| Delete    | Nobody (soft delete only)                                                                                        |

---

### E-05 — DailyReport

**Purpose.** The system's primary data artefact: one immutable record of one student's activity on one date.

**Common attributes**

| Attribute            | Type      | Req. | Notes                                                                                               |
| -------------------- | --------- | ---- | --------------------------------------------------------------------------------------------------- |
| `id`                 | UUID      | Yes  | PK                                                                                                  |
| `membership_id`      | UUID      | Yes  | FK → Membership                                                                                     |
| `report_date`        | Date      | Yes  | Student-local date; must equal today (VR-10)                                                        |
| `type`               | Enum      | Yes  | `Normal` / `Absent` / `Revision`                                                                    |
| `submitted_at`       | Timestamp | Yes  | UTC                                                                                                 |
| `submitted_timezone` | String    | Yes  | IANA snapshot at submission 💡 — makes `report_date` auditable if the user's timezone later changes |
| `deleted_at`         | Timestamp | No   | Soft delete (BR-05a)                                                                                |

**Type = `Normal`** — embedded value objects, not child entities (§8.3)

| Attribute                       | Type               | Req.                                              |
| ------------------------------- | ------------------ | ------------------------------------------------- |
| `no_memorization_today`         | Boolean            | Yes                                               |
| `memo_range`                    | AyahRange (VO-02)  | If not `no_memorization_today`                    |
| `memo_time`                     | TimeWindow (VO-03) | If `memo_range` present (VR-16)                   |
| `completed_50_repetitions`      | Boolean            | If `memo_range` present                           |
| `repetitions_in_single_session` | Boolean            | Only if `completed_50_repetitions` = true (VR-18) |
| `no_revision_today`             | Boolean            | Yes                                               |
| `rev_range`                     | AyahRange          | If not `no_revision_today`                        |
| `rev_time`                      | TimeWindow         | If `rev_range` present (VR-17)                    |
| `read_tafsir`                   | Boolean            | Yes                                               |

**Type = `Absent`**

| Attribute        | Type | Req.                                        |
| ---------------- | ---- | ------------------------------------------- |
| `absence_reason` | Enum | Yes — `Sick` / `Studying` / `Other` (VR-19) |

**Type = `Revision`**

| Attribute   | Type      | Req.        |
| ----------- | --------- | ----------- |
| `rev_range` | AyahRange | Yes (VR-20) |

**Relationships.** `DailyReport N → 1 Membership` · feeds `MemorizationCoverage` (E-08) · logically grouped into `WeeklyReport` by date range, with **no foreign key** (see §10.4).

**Lifecycle.** See ST-05 — a two-state lifecycle, and one of those states is terminal on creation.

**Business rules.** BR-16, BR-19…BR-26, BR-28a, BR-47, BR-48, BR-50, BR-52.

**Validation.** VR-10…VR-20, VR-14a, VR-35.

| Operation | Who                                                                                   |
| --------- | ------------------------------------------------------------------------------------- |
| Create    | Student (own membership, today only, not on recitation day, not if group archived)    |
| Read      | Student (own); Teacher (assigned groups); Admin (all). **Assistant: never** (DEC-B09) |
| Update    | Nobody (BR-22)                                                                        |
| Delete    | Nobody — soft delete only, as a cascade of membership termination                     |

---

### E-06 — WeeklyReport

**Purpose.** The weekly summary presented on the recitation day, and the sole carrier of `attended_recitation_call`.

| Attribute                   | Type      | Req. | Notes                                        |
| --------------------------- | --------- | ---- | -------------------------------------------- |
| `id`                        | UUID      | Yes  | PK                                           |
| `membership_id`             | UUID      | Yes  | FK → Membership                              |
| `week_start`                | Date      | Yes  | Derived from recitation day (BR-15)          |
| `week_end`                  | Date      | Yes  | The recitation-day date                      |
| `expected_days`             | Integer   | Yes  | 0–6 after prorating/truncation (FR-WR-09/10) |
| `missed_daily_reports`      | Integer   | Yes  | §18.2                                        |
| `missed_daily_memorization` | Integer   | Yes  | §18.2                                        |
| `missed_daily_revision`     | Integer   | Yes  | §18.2                                        |
| `missed_50_repetitions`     | Integer   | Yes  | §18.2                                        |
| `missed_single_session`     | Integer   | Yes  | §18.2                                        |
| `attended_recitation_call`  | Boolean   | Yes  | Default `false` (FR-WR-06)                   |
| `state`                     | Enum      | Yes  | `Open` / `Finalised`                         |
| `finalised_at`              | Timestamp | No   |                                              |
| `finalised_by`              | Enum      | No   | `Student` / `Scheduler`                      |
| `deleted_at`                | Timestamp | No   | Soft delete                                  |

💡 **Design note.** Metrics are **stored as computed values at finalisation**, not recomputed on read. Daily reports are immutable and non-backdatable (BR-21, BR-22), so a finalised week's inputs can never change; recomputation would be pure waste and would break NFR-12. Before finalisation the metrics are computed on read. See ADR-003.

**Relationships.** `WeeklyReport N → 1 Membership`. Derived from DailyReports by date range only.

**Lifecycle.** See ST-06.

**Business rules.** BR-15, BR-17, BR-23…BR-25, BR-30, BR-45, BR-47.

**Validation.** VR-21, VR-22, VR-36.

| Operation | Who                                                                                          |
| --------- | -------------------------------------------------------------------------------------------- |
| Create    | System (on entering the recitation day, or lazily on first read that day)                    |
| Read      | Student (own); Teacher (assigned groups); Admin (all). **Assistant: never**                  |
| Update    | Student — `attended_recitation_call` once, on the recitation day only; System — finalisation |
| Delete    | Nobody — soft delete only                                                                    |

---

### E-07 — PaymentRecord

**Purpose.** Records that an Assistant asserted a specific cycle was paid. **Only paid cycles produce a row** (ADR-006); unpaid cycles are the absence of a row.

| Attribute       | Type      | Req. | Notes                                        |
| --------------- | --------- | ---- | -------------------------------------------- |
| `id`            | UUID      | Yes  | PK                                           |
| `membership_id` | UUID      | Yes  | FK → Membership                              |
| `cycle_index`   | Integer   | Yes  | 0-based. Unique with `membership_id` (VR-26) |
| `amount`        | Decimal   | Yes  | Fixed 30 TND (BR-31)                         |
| `paid_at`       | Timestamp | Yes  | When recorded                                |
| `recorded_by`   | UUID      | Yes  | FK → User (Assistant) (BR-34)                |
| `deleted_at`    | Timestamp | No   | Soft delete                                  |

**Relationships.** `PaymentRecord N → 1 Membership` · `N → 1 User` (recorder).

**Business rules.** BR-31…BR-35, BR-54, BR-55, BR-56.

**Validation.** VR-26, VR-27, VR-37.

| Operation | Who                                                                         |
| --------- | --------------------------------------------------------------------------- |
| Create    | Assistant (students in assigned groups, any unpaid cycle, any order)        |
| Read      | Student (own); Assistant (assigned groups); Admin (all). **Teacher: never** |
| Update    | Nobody                                                                      |
| Delete    | Nobody — soft delete only                                                   |

⚠️ **OPEN ISSUE — ISS-02**: no requirement covers **correcting a mistakenly recorded payment**. With no update, no delete and no audit on payments (DEC-D05), an Assistant error is permanent and untraceable. Medium severity; see §29.

---

### E-08 — MemorizationCoverage

**Purpose.** The persisted interval set from which `ahzab_completed` and all progress figures derive. One per Membership.

| Attribute                 | Type                | Req. | Notes                                                    |
| ------------------------- | ------------------- | ---- | -------------------------------------------------------- |
| `id`                      | UUID                | Yes  | PK                                                       |
| `membership_id`           | UUID                | Yes  | FK → Membership, unique                                  |
| `intervals`               | CoverageSet (VO-07) | Yes  | Ordered, disjoint, non-adjacent, merged on insert        |
| `last_memorized_position` | AyahPosition        | No   | End of the most recent memorization submission (DEC-D02) |
| `ahzab_completed`         | Integer             | Yes  | Cached derivation of BR-51                               |
| `updated_at`              | Timestamp           | Yes  |                                                          |

**Business rules.** BR-50, BR-51, BR-53.

**Algorithm.** §17.6.

| Operation | Who                                                           |
| --------- | ------------------------------------------------------------- |
| Create    | System (at membership creation, seeded per BR-53)             |
| Read      | Student (own); Teacher (assigned groups); Admin (all)         |
| Update    | System only (on accepting a report with a memorization range) |
| Delete    | Nobody — soft delete with the membership                      |

---

### E-09 — DeviceToken · E-10 — NotificationPreference · E-11 — NotificationLog

| Entity                          | Key attributes                                                                                            | Notes                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **E-09 DeviceToken**            | `id`, `user_id`, `token`, `platform` (`iOS`/`Android`), `registered_at`, `last_seen_at`, `invalidated_at` | Many per user. Invalidated on logout or transport rejection (FR-AUTH-08) |
| **E-10 NotificationPreference** | `id`, `user_id`, `category`, `muted` (Boolean)                                                            | Account-critical categories cannot be set to muted (BR-61, FR-NOTIF-06)  |
| **E-11 NotificationLog**        | `id`, `user_id`, `category`, `dispatched_at`, `outcome`, `transport_reference`                            | Write-once. FR-NOTIF-08 (Should)                                         |

Create/Read/Update: system and self only. Nobody deletes; retention is a policy question — ⚠️ ISS-08.

---

### E-12 — AuditEntry

**Purpose.** Write-once record of the three audited actions (BR-62).

| Attribute        | Type      | Req.                                                   |
| ---------------- | --------- | ------------------------------------------------------ |
| `id`             | UUID      | Yes                                                    |
| `actor_id`       | UUID      | Yes                                                    |
| `action`         | Enum      | Yes — `ENROLLMENT_TOGGLED` / `GROUP_CREATED` / `LOGIN` |
| `target_type`    | String    | No                                                     |
| `target_id`      | UUID      | No                                                     |
| `previous_value` | JSON      | No                                                     |
| `new_value`      | JSON      | No                                                     |
| `occurred_at`    | Timestamp | Yes                                                    |

Create: system. Read: Admin only. Update/Delete: nobody. No user-facing UI in MVP (⏳ DEC-D05).

---

### E-13 — Surah · E-14 — HizbBoundary (reference data)

| Entity                | Attributes                                                                                                 | Source                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **E-13 Surah**        | `number` (1–114), `name_ar`, `ayah_count`, `ordinal_offset` (cumulative ayah count before this surah)      | EXT-04 JSON, loaded at deployment |
| **E-14 HizbBoundary** | `hizb_number` (1–60), `start_surah`, `start_ayah`, `end_surah`, `end_ayah`, `start_ordinal`, `end_ordinal` | EXT-04 JSON                       |

Read-only to the entire application at runtime. Loaded by a deployment migration, versioned with the application.

⚠️ **VER-01 (Low)** — verify at implementation that the dataset's ayah counts match the mushaf the center teaches. Al-Baqara is 286 ayat in Hafs and 285 in Qalun/Warsh; a mismatch would surface as students being unable to enter ayah numbers they know exist. One-time check, no decision required.

---

## 10. Entity Relationships

### 10.1 Relationship catalogue

| #    | Entity A      | Card.    | Entity B               | Meaning                        | Optionality   | Constraints                                                                        |
| ---- | ------------- | -------- | ---------------------- | ------------------------------ | ------------- | ---------------------------------------------------------------------------------- |
| R-01 | User          | 1 → 0..N | JoinRequest            | applies through                | Optional      | ≤1 with `status = Pending` (BR-01)                                                 |
| R-02 | Group         | 1 → 0..N | JoinRequest            | targeted by                    | Optional      | Group must be `Open` + `Active` + gender-matching at creation (VR-08, FR-JOIN-03a) |
| R-03 | User          | 1 → 0..N | Membership             | enrolls through                | Optional      | ≤1 with `state = Active` (BR-39)                                                   |
| R-04 | Group         | 1 → 0..N | Membership             | contains                       | Optional      | No cap (BR-09)                                                                     |
| R-05 | JoinRequest   | 1 → 0..1 | Membership             | produces                       | Optional      | Only when `status = Accepted`                                                      |
| R-06 | Group         | N → 1    | User (Teacher)         | is led by                      | **Mandatory** | Target must have `role = Teacher` (VR-24)                                          |
| R-07 | Group         | N → 1    | User (Assistant)       | is supported by                | **Mandatory** | Target must have `role = Assistant` (VR-24)                                        |
| R-08 | Group         | N → 1    | User (Admin)           | was created by                 | Mandatory     |                                                                                    |
| R-09 | Membership    | 1 → 0..N | DailyReport            | records                        | Optional      | ≤1 per `report_date` (BR-19)                                                       |
| R-10 | Membership    | 1 → 0..N | WeeklyReport           | summarises                     | Optional      | ≤1 per reporting week (VR-22)                                                      |
| R-11 | Membership    | 1 → 0..N | PaymentRecord          | is billed through              | Optional      | ≤1 per `cycle_index` (VR-26)                                                       |
| R-12 | Membership    | 1 → 1    | MemorizationCoverage   | tracks progress in             | **Mandatory** | Created with the membership                                                        |
| R-13 | PaymentRecord | N → 1    | User (Assistant)       | was recorded by                | Mandatory     |                                                                                    |
| R-14 | User          | 1 → 0..N | DeviceToken            | receives push on               | Optional      |                                                                                    |
| R-15 | User          | 1 → 0..N | NotificationPreference | configures                     | Optional      | Absent = unmuted                                                                   |
| R-16 | DailyReport   | 0..N → 1 | WeeklyReport           | **derived association, no FK** | —             | See §10.4                                                                          |

### 10.2 Cardinality analysis

**1:1 relationships** — only R-12 (Membership ↔ MemorizationCoverage). It is 1:1 rather than an embedded attribute because the interval set is unbounded in size and updated on a different cadence from the membership row.

**1:N relationships** — R-01, R-02, R-03, R-04, R-09, R-10, R-11, R-14, R-15. All resolve to a foreign key on the N side. None requires an associative entity.

**Apparent N:M relationships and their resolution:**

| Apparent N:M                                                     | Resolution                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User ↔ Group** ("a person may be in several groups over time") | Resolved by **Membership (E-03)** — a genuine associative entity with its own attributes (`started_at`, `ended_at`, `state`) and its own children. This is the case the SRS's `User.group_id` could not express, and it is the direct consequence of DEC-B10 + DEC-C02. |
| **User ↔ Group** via staff assignment                            | **Not** N:M. BR-07 fixes exactly one Teacher and one Assistant per group, so it is two separate N:1 relationships (R-06, R-07). A Teacher leading several groups is the N side. No junction table.                                                                      |
| **User ↔ Group** via applications                                | Resolved by **JoinRequest (E-04)**, which is an associative entity carrying the full applicant profile.                                                                                                                                                                 |

**Conclusion.** The model requires exactly **two associative entities** — `Membership` and `JoinRequest` — and both carry substantial attributes of their own, which is what distinguishes a domain entity from a mere junction table.

### 10.3 Consequence of introducing Membership

Had membership remained `User.group_id` as in SRS §8.1:

| Requirement                                    | Would it work?                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| DEC-B10 soft delete                            | ❌ No — reports would hang off User with no way to scope "which enrollment"                     |
| DEC-C02 fresh rejoin                           | ❌ No — old and new reports would intermingle in every query                                    |
| DEC-C04 historical aggregates by active period | ❌ No — no start/end dates to bound the period                                                  |
| FR-WR-09 prorating from join date              | ⚠️ Partially — `User.joined_at` would be overwritten on rejoin, destroying the earlier boundary |
| BR-39 one active membership                    | ✅ Trivially, but only by making the other four impossible                                      |

This is recorded as **ADR-001**, decided.

### 10.4 Why WeeklyReport has no foreign key to DailyReport

R-16 is an association by **date range**, not by reference:

- A WeeklyReport must exist even when zero DailyReports exist (FR-WR-08). A FK-based association cannot represent "summarises nothing".
- The set of contributing reports is fully determined by `(membership_id, week_start, week_end)`. Storing links would duplicate that determination and create a second thing to keep consistent.
- The weekly metrics are **snapshotted at finalisation** (§9, E-06 design note). After finalisation the link has no query value.

💡 **RECOMMENDATION** — resolve the association at query time with a date-range predicate on `(membership_id, report_date)`, backed by the index specified in §24.6.

---

## 11. State Models

Only entities with a genuinely meaningful lifecycle are modelled. States not supported by the SRS or a stakeholder decision are marked **Proposed — requires business confirmation**.

### ST-01 — User role state

```
        registration
             │
             ▼
        ┌─────────┐   Assistant accepts join request      ┌───────────┐
        │  User   │──────────────────────────────────────▶│  Student  │
        │         │◀──────────────────────────────────────│           │
        └────┬────┘        Admin removes from group       └───────────┘
             │
             │ Admin promotes (BR-R03; only from role=User)
             ├──────────────────────────▶ ┌───────────┐
             │                            │  Teacher  │
             │                            └───────────┘
             └──────────────────────────▶ ┌───────────┐
                                          │ Assistant │
                                          └───────────┘

        ┌─────────┐  seeded at installation; no transitions in or out
        │  Admin  │  (BR-R05; cannot self-demote — DEC-C07)
        └─────────┘
```

| Transition                 | Trigger               | Actor     | Guards                                                         |
| -------------------------- | --------------------- | --------- | -------------------------------------------------------------- |
| User → Student             | Join request accepted | Assistant | Target group Open + Active; gender match; no Active membership |
| Student → User             | Removal from group    | Admin     | —                                                              |
| User → Teacher / Assistant | Promotion             | Admin     | Source role must be exactly `User` (BR-R03)                    |
| Teacher/Assistant → User   | Demotion              | Admin     | **Blocked** while assigned to any non-archived group (BR-44)   |
| Any → Admin                | —                     | —         | Impossible (BR-R05)                                            |

⚠️ **OPEN ISSUE — ISS-03**: demotion of a Teacher or Assistant back to `User` is implied by DEC-A09's blocking rule but is never explicitly required by any FR. Low severity — clarify whether demotion exists as a feature or whether staff accounts are simply permanent.

### ST-02 — Group state (two orthogonal dimensions)

```
   LIFECYCLE (Admin only)              ENROLLMENT (Teacher only)
   ┌──────────┐                        ┌──────────┐
   │  Active  │◀───un-archive───┐      │  Closed  │◀────┐   (default at creation)
   └────┬─────┘                 │      └────┬─────┘     │
        │                       │           │           │
     archive                    │        toggle      toggle
        │                       │           │           │
        ▼                       │           ▼           │
   ┌──────────┐─────────────────┘      ┌──────────┐─────┘
   │ Archived │                        │   Open   │
   └──────────┘                        └──────────┘

   Archived dominates: an Archived group is treated as not accepting
   applications regardless of its enrollment_status (BR-42).
```

| State combination | New applications | Daily reports | Weekly reports    | Payment cycles | Pending requests            |
| ----------------- | ---------------- | ------------- | ----------------- | -------------- | --------------------------- |
| Active + Open     | Accepted         | Accepted      | Generated         | Advance        | Reviewable                  |
| Active + Closed   | Blocked          | Accepted      | Generated         | Advance        | **Reviewable** (DEC-C06)    |
| Archived + either | Blocked          | **Rejected**  | **Not generated** | **Stopped**    | **Auto-rejected** (DEC-C06) |

Students in an archived group **remain enrolled with `role = Student`** (DEC-C03). Their metric periods terminate at `archived_at`.

### ST-03 — Membership state

```
   ┌──────────┐   Admin removes student (FR-GRP-07)   ┌────────────┐
   │  Active  │──────────────────────────────────────▶│ Terminated │
   └──────────┘                                       └────────────┘
        ▲                                                    │
        │ created on join acceptance                         │ terminal
        │ (FR-REQ-05)                                        ▼
   ┌──────────┐                                        (never revived —
   │ (none)   │                                         rejoin creates a
   └──────────┘                                         NEW membership,
                                                        DEC-C02 / BR-40)
```

`Terminated` is terminal. Re-acceptance produces a **new** Membership row with a new `id`, zero coverage and zero history.

💡 **Proposed — requires business confirmation:** no `Suspended` state exists. If the center ever needs to pause a student without deleting their history (illness, travel), that is a new state, not a variant of removal. Recorded as a future consideration (§32).

### ST-04 — JoinRequest state

```
             submitted
                 │
                 ▼
           ┌───────────┐
           │  Pending  │
           └─────┬─────┘
                 │
      ┌──────────┼───────────────┬────────────────────┐
      │          │               │                    │
   Assistant  Assistant     Group archived      (no cancel action —
   accepts    rejects       (FR-REQ-08)          FR-JOIN-12)
      │          │               │
      ▼          ▼               ▼
 ┌──────────┐ ┌──────────┐ ┌──────────┐
 │ Accepted │ │ Rejected │ │ Rejected │  resolution_source = System
 └──────────┘ └──────────┘ └──────────┘
   terminal     terminal      terminal
```

All three end states are terminal. There is no expiry, no withdrawal and no reopening. A group merely closing enrollment does **not** change the state (FR-REQ-09).

### ST-05 — DailyReport state

```
   (none) ──submit──▶ ┌───────────┐ ──membership terminated──▶ ┌──────────┐
                      │ Submitted │                            │ Archived │
                      └───────────┘                            └──────────┘
                       immutable                            (soft-deleted;
                       (BR-22)                               Admin-visible only)
```

There is no `Draft` state — NFR-02 forbids offline drafting and DEC-026 rules out local queueing. There is no `Edited` or `Deleted` state for any actor.

### ST-06 — WeeklyReport state

```
   (none)
     │  entering the recitation day, or first read that day
     ▼
  ┌────────┐    Student confirms checkbox (FR-WR-05)    ┌────────────┐
  │  Open  │──────────────────────────────────────────▶ │ Finalised  │
  │        │                                            │            │
  │        │──────────────────────────────────────────▶ │ attended = │
  └────────┘  Scheduler at student-local midnight       │ as recorded│
              with attended = false (FR-WR-06)          └────────────┘
                                                          immutable
```

| Transition       | Actor     | Guard                                                                   |
| ---------------- | --------- | ----------------------------------------------------------------------- |
| → Open           | System    | It is the group's recitation day; membership Active; group not Archived |
| Open → Finalised | Student   | Only on the recitation day (VR-21); exactly once                        |
| Open → Finalised | Scheduler | Student-local midnight passed with no confirmation                      |

⚠️ **Edge case EC-24**: if the Scheduler fails to run, a report remains `Open` past its day. It must be finalised on the next successful run with `attended = false`, and must **never** become confirmable retroactively. Specified in §19.6.

### ST-07 — PaymentCycle state (derived, not stored)

```
   ┌──────────┐  today ≥ cycle_end − 10d   ┌───────────┐  today > cycle_end
   │  Unpaid  │──────────────────────────▶ │ Due Soon  │──────────────────┐
   │ (future) │      (current cycle only)  └───────────┘                  │
   └────┬─────┘                                  │                        ▼
        │                                        │                 ┌──────────┐
        │      Assistant records payment         │                 │  Unpaid  │
        └────────────────┬───────────────────────┴────────────────▶│ (arrears)│
                         ▼                                         └────┬─────┘
                   ┌──────────┐                                         │
                   │   Paid   │◀────────────────────────────────────────┘
                   └──────────┘         payment recorded out of order
                    terminal                     (BR-56)
```

The SRS enum is `Paid` / `Due Soon` / `Unpaid`. Overdue cycles are surfaced as `Unpaid` plus an **arrears count** (FR-PAY-10) rather than a fourth state, so no new enum value is introduced.

---

## 12. Detailed Use Cases

UC-01 to UC-10 correspond to the SRS use cases, expanded to system level. UC-11 onward are new, arising from decisions taken during analysis.

### UC-01 — Register and Log In

| Field                | Value                                    |
| -------------------- | ---------------------------------------- |
| **Primary actor**    | User (unregistered)                      |
| **Secondary actors** | EXT-02 (email, for reset only)           |
| **Goal**             | Obtain an authenticated session          |
| **Preconditions**    | None                                     |
| **Trigger**          | Actor opens the app and selects Register |

**Main success scenario**

1. Actor supplies email and password.
2. System validates format (VR-01) and strength (VR-02).
3. System verifies email uniqueness.
4. System creates the account with `role = User` (FR-AUTH-02).
5. System captures and persists the client IANA timezone (FR-AUTH-07).
6. System registers the device push token (FR-AUTH-08).
7. System issues a session and routes to the User dashboard (FR-AUTH-05).

**Alternative flows**

- 3a. Email already registered → error; remain on the form; **do not** disclose whether the account exists beyond what registration inherently reveals.
- 5a. Client supplies no or an unrecognised timezone → default to the center timezone and flag for refresh at next session. 💡

**Exception flows**

- E1. Push token registration fails → registration still succeeds; notifications degrade silently (BR-60).

**Postconditions** — account exists with `role = User`; session active; timezone persisted.

**Data created** User (E-01), DeviceToken (E-09), AuditEntry (`LOGIN`).
**Authorization** — none required.

---

### UC-02 — See Dashboard

| Field             | Value                                            |
| ----------------- | ------------------------------------------------ |
| **Primary actor** | Any authenticated actor                          |
| **Goal**          | See the view appropriate to one's role and state |
| **Preconditions** | Authenticated                                    |
| **Trigger**       | App opened                                       |

**Main success scenario**

1. System validates the session.
2. System resolves role and, for Students, the Active Membership.
3. System refreshes `User.timezone` if the client value differs (FR-AUTH-07).
4. System renders the role dashboard.

| Role      | Content                                                                          | Source       |
| --------- | -------------------------------------------------------------------------------- | ------------ |
| User      | Join entry point, or pending-request **status only** (DEC-C09)                   | E-04         |
| Student   | Today's report action, Commitment Score, payment status and arrears              | §18.3, §18.5 |
| Assistant | Pending request count, payment follow-up list. **No performance data** (DEC-B09) | E-04, E-07   |
| Teacher   | Assigned groups with commitment averages and at-risk counts                      | §18.3, §18.4 |
| Admin     | Groups, staff, students, recovery                                                | E-02, E-03   |

**Alternative flows**

- 2a. Student whose group is `Archived` → dashboard renders with reporting actions disabled and an explanatory state (BR-42).
- 2b. Student whose Membership was terminated during the session → role has reverted to `User`; render the User dashboard.

**Authorization** — role-scoped; every figure is filtered by §14.

---

### UC-03 — Apply to Join a Group

| Field             | Value                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| **Primary actor** | User                                                                                     |
| **Goal**          | Submit a scored application to one group                                                 |
| **Preconditions** | Authenticated; `role = User`; no `Pending` request (BR-01); no Active Membership (BR-03) |
| **Trigger**       | Actor selects _Join a Group_                                                             |

**Main success scenario**

1. Actor selects _Join a Group_.
2. **Step 1** — Actor declares gender (FR-JOIN-02).
3. **Step 2** — System lists groups where `gender = declared` AND `enrollment_status = Open` AND `lifecycle_state = Active` (FR-JOIN-03, FR-JOIN-03a). Actor selects one.
4. **Step 3** — Actor completes the applicant profile.
5. Actor selects the ahzab already memorized, minimum 5 (FR-JOIN-04a, BR-57).
6. Actor accepts the 30 TND quarterly fee condition (FR-JOIN-06).
7. Actor submits.
8. System re-validates gender against the group **server-side** (VR-08) and re-checks eligibility (VR-09).
9. System computes the Applicant Score (§18.6) and stores it as an immutable snapshot.
10. System persists the request with `status = Pending`.
11. System notifies the group's Assistant (§22.2, event N-05).
12. System displays confirmation.

**Alternative flows**

- 3a. No matching group → empty state; flow ends.
- 4a. `program_goal = Revision` → submission blocked with explanation (VR-07, AC-04).
- 5a. Fewer than 5 ahzab selected → submission blocked (BR-57).
- 6a. Fee not accepted → submit disabled (VR-06).

**Exception flows**

- E1. Group closes or is archived between step 3 and step 7 → reject with a stale-state error; return to step 3 with a refreshed list.
- E2. A concurrent request from the same user is already `Pending` → reject (VR-09). Enforced by a partial unique index (§24.6), not by a read-then-write check.

**Postconditions** — exactly one `Pending` request exists for this User.

**Data created** JoinRequest (E-04). **Data read** Group (E-02), User (E-01).
**Authorization** — `role = User` only.

---

### UC-04 — Manage Join Requests

| Field             | Value                                             |
| ----------------- | ------------------------------------------------- |
| **Primary actor** | Assistant                                         |
| **Goal**          | Admit or decline applicants for assigned groups   |
| **Preconditions** | Authenticated as Assistant with ≥1 assigned group |
| **Trigger**       | Actor opens the join requests page                |

**Main success scenario**

1. System lists `Pending` requests for the actor's assigned groups only (FR-REQ-01).
2. System sorts by `score` descending, then `created_at` ascending (FR-REQ-02, FR-REQ-02a).
3. Actor opens a request and views the full profile, including restricted personal data (NFR-10).
4. Actor accepts or rejects.
5. **On accept:**
   a. System verifies the request is still `Pending` and the group is still `Active`.
   b. System sets `status = Accepted`, `reviewed_at`, `reviewed_by`.
   c. System changes `User.role` to `Student`.
   d. System copies `full_name` and `gender` onto the User (FR-REQ-05a).
   e. System creates a Membership with `started_at = today`, `state = Active` (FR-REQ-05).
   f. System creates MemorizationCoverage seeded from `memorized_ahzab` (FR-REQ-05b, BR-53).
   g. System notifies the applicant (event N-03, non-mutable).
6. **On reject:** system sets `status = Rejected`, `resolution_source = Assistant`; notifies the applicant (event N-04, non-mutable). No reason is captured (FR-REQ-06).

**Alternative flows**

- 4a. Applicant has since acquired an Active Membership elsewhere → block acceptance with a stale-state error.
- 4b. Group was archived since submission → the request was already auto-rejected (FR-REQ-08); it is no longer in the list.

**Exception flows**

- E1. Two Assistants act on the same request concurrently → the first write wins; the second receives a stale-state error. Enforced by an optimistic-concurrency check on `status`.

**Postconditions** — request is terminal; on acceptance a Membership and a seeded Coverage exist and the first payment cycle has begun.

**Data created** Membership (E-03), MemorizationCoverage (E-08).
**Data updated** JoinRequest (E-04), User (E-01).
**Authorization** — Assistant, scoped to assigned groups (§14.3).

⚠️ Note: acceptance mutates `User.role`, which §10 of the SRS attributes to the Admin. §13 resolves this by separating **administrative promotion** from **enrollment promotion** (CON-10).

---

### UC-05 — Submit Daily Report

| Field             | Value                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Primary actor** | Student                                                                                                                      |
| **Goal**          | Record today's memorization activity immutably                                                                               |
| **Preconditions** | Authenticated Student with an Active Membership; group `Active`; today is not the recitation day; no report exists for today |
| **Trigger**       | Actor selects _Send Daily Report_                                                                                            |

**Main success scenario**

1. System resolves the student's local date from `User.timezone` (DEC-B03).
2. System verifies today is not the group's recitation day (VR-12) and no report exists (VR-11).
3. Actor selects the report type (FR-DR-05).
4. Actor completes type-specific fields.
5. Actor submits.
6. System validates §15.3 rules, including every ayah position against the reference dataset (FR-PROG-05).
7. System persists the report immutably with `submitted_at` and `submitted_timezone`.
8. If a memorization range is present, system merges it into MemorizationCoverage and recomputes `ahzab_completed` (FR-DR-12, §17.6).
9. System suppresses today's reminder notification (FR-NOTIF-03).
10. System displays confirmation and the updated progress figure.

**Alternative flows**

- 2a. Report already exists → block; display the existing report (AC-07).
- 2b. Today is the recitation day → redirect to the Weekly Report (AC-10).
- 3a. Type `Absent` → capture reason only (VR-19).
- 3b. Type `Revision` → capture revision range only (VR-20).
- 4a. Type `Normal` with `no_memorization_today` **and** `no_revision_today` → **accepted** (BR-48); counted as a miss on both metrics.

**Exception flows**

- E1. Validation fails → highlight offending fields; **nothing is stored** (AC-09 antecedent).
- E2. Submission arrives after student-local midnight → rejected (VR-10, AC-08). No grace period exists.
- E3. Group archived since the screen opened → reject (FR-DR-11).
- E4. Two devices submit concurrently → the unique constraint on `(membership_id, report_date)` rejects the second (§24.6).
- E5. Coverage update fails after the report is persisted → the report **stands**; coverage is repaired by a reconciliation job. Coverage is a derivable projection, so this is recoverable; losing the report would not be. 💡

**Postconditions** — exactly one immutable DailyReport exists for this membership and date; coverage reflects it.

**Data created** DailyReport (E-05). **Data updated** MemorizationCoverage (E-08).
**Data read** Membership, Group, Surah, HizbBoundary.
**Authorization** — Student, own Active Membership only.

---

### UC-06 — Submit Weekly Report

| Field               | Value                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| **Primary actor**   | Student                                                                                          |
| **Secondary actor** | Scheduler (A-06) on the alternative path                                                         |
| **Goal**            | Confirm the week's summary and declare recitation attendance                                     |
| **Preconditions**   | Today is the group's recitation day in the student's timezone; Membership Active; group `Active` |
| **Trigger**         | Recitation day, or actor opens the Weekly Report                                                 |

**Main success scenario**

1. System determines the reporting week (VO-04) from the group's recitation day.
2. System creates the WeeklyReport in state `Open` if it does not exist (FR-WR-08).
3. System computes all metrics per §18.2 over the effective window.
4. System displays metrics read-only (FR-WR-03).
5. Actor checks or leaves unchecked _I attended the recitation call_.
6. Actor submits (FR-WR-05).
7. System sets `attended_recitation_call`, `state = Finalised`, `finalised_by = Student`, and snapshots the metrics.

**Alternative flows**

- 5a. Not submitted by student-local midnight → Scheduler finalises with `attended = false`, `finalised_by = Scheduler` (FR-WR-06, AC-12).
- 2a. Student submitted zero daily reports → the report is still produced, all metrics counted as missed (FR-WR-08, DEC-A07).
- 2b. Membership began mid-week → `expected_days` prorated from `started_at` (FR-WR-09).
- 2c. Group archived mid-week → `expected_days` truncated at `archived_at`; no further weekly reports (FR-WR-10, BR-42).
- 3a. All expected days were `Absent — Sick`/`Studying` → `expected_days` effective count is 0; metrics are 0 and the week contributes nothing to any rate (DEC-B04).

**Exception flows**

- E1. Attempted submission on a non-recitation day → rejected (VR-21).
- E2. Report already `Finalised` → rejected (FR-WR-07, VR-22).
- E3. Scheduler missed its window → finalise on the next run with `attended = false`; never allow retroactive confirmation (EC-24).

**Postconditions** — exactly one `Finalised` WeeklyReport exists for this membership and week.

**Data created/updated** WeeklyReport (E-06). **Data read** DailyReport, Membership, Group.
**Authorization** — Student, own Active Membership; Scheduler for the timeout path.

---

### UC-07 — Track Group Performance

| Field             | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| **Primary actor** | Teacher                                                |
| **Goal**          | Judge group health and identify who needs intervention |
| **Preconditions** | Authenticated Teacher; group is assigned to the actor  |
| **Trigger**       | Actor opens a group's performance page                 |

**Main success scenario**

1. Actor selects a period; default is the current reporting week (FR-PERF-03).
2. System verifies the actor is the assigned Teacher (FR-PERF-06, NFR-09).
3. System resolves the member set: all Memberships whose active window intersects the period — **including terminated ones** for the portion they were active (FR-PERF-09, DEC-C04).
4. System aggregates **daily reports** (submission rate, absence-reason breakdown) **and weekly reports** (attendance) — correcting SRS UC-07 step 3, which named weekly reports alone (CON-11).
5. System computes the group Commitment average, the weakest-first student list, and the at-risk list per DEC-B05.
6. System excludes terminated memberships from the current-week view and the at-risk list (FR-PERF-10).
7. Actor may drill into any student → **UC-08**.

**Alternative flows**

- 3a. Group has no members in the period → empty state with no zero-division artefacts.
- 5a. Every student's Commitment Score is null (DEC-B04) → group average displays "not enough data".

**Exception flows**

- E1. Actor is not the assigned Teacher → HTTP 403 (AC-17).

**Data read** Membership, DailyReport, WeeklyReport, Group, User (names).
**Authorization** — Teacher scoped to assigned groups; Admin unrestricted.

---

### UC-08 — Track Student Performance

| Field             | Value                                                         |
| ----------------- | ------------------------------------------------------------- |
| **Primary actor** | Teacher (also Student for own data, Admin unrestricted)       |
| **Goal**          | Understand one student's consistency and memorization state   |
| **Preconditions** | Student's Membership belongs to a group assigned to the actor |
| **Trigger**       | Actor opens a student's performance page                      |

**Main success scenario**

1. Actor selects a period.
2. System computes the six dashboard elements of §9.4.1 over the period (§18.3):
   Commitment Score · ahzab completed and `last_memorized_position` · day breakdown donut · repetition-quality percentage · recitation attendance percentage · days since last report.
3. System renders, marking any undefined component as "not enough data" rather than zero (DEC-B04).
4. Actor may open the raw daily report list for the same period (FR-PERF-04).

**Alternative flows**

- 2a. Coverage is non-contiguous → `last_memorized_position` is presented as an **activity** indicator with no implication of linear progress (DEC-D02, BR-50).
- 2b. Student is in a Revision Period → memorization misses are excluded from `MemorizationRate` (BR-27, BR-28a). The UI states why.

**Exception flows**

- E1. Student not in the actor's groups → HTTP 403.

**Authorization** — Teacher (assigned), Student (own), Admin (all). **Assistant: never** (DEC-B09).

---

### UC-09 — Manage Payments

| Field             | Value                                          |
| ----------------- | ---------------------------------------------- |
| **Primary actor** | Assistant                                      |
| **Goal**          | Track and record offline fee collection        |
| **Preconditions** | Authenticated Assistant with ≥1 assigned group |
| **Trigger**       | Actor opens the payments page                  |

**Main success scenario**

1. System lists students in assigned groups.
2. For each, system **derives** the full cycle ledger from `membership.started_at` (§18.5) — no cycle rows are read.
3. System derives per-cycle status: `Paid` where a PaymentRecord exists, `Due Soon` for the current cycle within 10 days of its end, otherwise `Unpaid` (FR-PAY-03/04, BR-55).
4. System displays the arrears count and the oldest unpaid cycle end date (FR-PAY-10, DEC-B06).
5. Actor filters by status (FR-PAY-06).
6. Actor records payment for a chosen cycle, in any order (FR-PAY-11, BR-56).
7. System creates a PaymentRecord with `recorded_by` = actor.

**Alternative flows**

- 2a. Group archived → cycle generation stops at `archived_at` (FR-PAY-12, DEC-C03).
- 2b. Membership terminated → cycle generation stops at `ended_at`.
- 6a. Cycle already paid → blocked (VR-26, unique constraint).

**Exception flows**

- E1. Student is not in the actor's assigned groups → HTTP 403.
- E2. ⚠️ Payment recorded in error → **no correction path exists** (ISS-02).

**Data created** PaymentRecord (E-07). **Data read** Membership, User (names).
**Authorization** — Assistant scoped to assigned groups. **Teacher: never.**

---

### UC-10 — Manage Groups and Staff

| Field             | Value                            |
| ----------------- | -------------------------------- |
| **Primary actor** | Admin                            |
| **Goal**          | Configure the center's structure |
| **Preconditions** | Authenticated as Admin           |

**Main success scenario**

1. Actor creates a group with name, gender and recitation day (FR-GRP-01).
2. Actor assigns exactly one Teacher and one Assistant (FR-GRP-02); both must hold the matching role (VR-24).
3. System creates the group with `enrollment_status = Closed`, `lifecycle_state = Active`.
4. System writes an audit entry (`GROUP_CREATED`, BR-62).
5. Actor may promote a User to Teacher or Assistant (FR-ADMIN-03) — source role must be exactly `User` (BR-R03).
6. Actor may remove a Student → **UC-12**.

**Alternative flows**

- 2a. Chosen user does not hold the required role → blocked (VR-24). The Admin must promote first.
- 1a. Recitation day is not supplied → creation blocked (VR-23); it can never be set later (VR-25).

**Data created** Group (E-02), AuditEntry (E-12). **Data updated** User.role.
**Authorization** — Admin only.

---

### UC-11 — Reassign Group Staff _(NEW — DEC-A09)_

| Field             | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| **Primary actor** | Admin · **Goal** Replace a group's Teacher or Assistant |
| **Preconditions** | Group exists; a replacement user holds the correct role |

1. Actor opens the group and selects reassign.
2. Actor chooses a replacement holding the required role (VR-24).
3. System updates `teacher_id` or `assistant_id` atomically — the field is never transiently null (FR-GRP-03).
4. Access scope for both the outgoing and incoming staff member changes immediately (§14).

**Exception flows** — E1. Replacement does not hold the required role → blocked. E2. Reassigning to the same user → no-op.

⚠️ **OPEN ISSUE — ISS-04**: reassignment gives the incoming Teacher **full historical visibility** of reports predating their assignment, and removes it from the outgoing one. No requirement states whether that is intended. Medium; see §29.

---

### UC-12 — Remove a Student _(expanded — DEC-B10)_

| Field             | Value                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| **Primary actor** | Admin · **Goal** End a student's enrollment while preserving center records |
| **Preconditions** | Target has an Active Membership                                             |

1. Actor selects a student and confirms removal.
2. System sets `membership.state = Terminated`, `ended_at = today`, `ended_by = actor`.
3. System soft-deletes all DailyReports, WeeklyReports, PaymentRecords and the JoinRequest for that Membership (BR-05a).
4. System sets `User.role = User`.
5. System notifies the student (event N-08, non-mutable).
6. The account may reapply immediately (BR-04, AC-21) — producing a **new** Membership with zero history (BR-40).

**Postconditions** — no user-facing surface exposes the terminated data; the Admin can recover it; historical group aggregates still include the student for the period they were active (FR-PERF-09).

**Exception flows** — E1. Admin attempts to remove themselves → blocked (FR-ADMIN-02). E2. Target has no Active Membership → no-op.

---

### UC-13 — Archive / Un-archive a Group _(NEW — DEC-B07/C03)_

| Field             | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| **Primary actor** | Admin · **Goal** Retire a group without destroying its history |

1. Actor selects archive on a group.
2. System sets `lifecycle_state = Archived`, `archived_at = today`.
3. System auto-rejects every `Pending` request for the group with `resolution_source = System` (FR-REQ-08) and notifies each applicant (event N-04).
4. Daily report submission is blocked from that date (FR-DR-11); weekly report generation stops (BR-42); payment cycles stop advancing (FR-PAY-12).
5. Students **remain enrolled** with `role = Student` (DEC-C03).
6. Un-archiving reverses steps 2 and 4 but does **not** revive auto-rejected requests.

⚠️ **OPEN ISSUE — ISS-09**: after un-archiving, do metric periods resume with a gap, or does the archived interval count as excluded days? Low severity; see §29.

---

### UC-14 — Toggle Group Enrollment

| Field             | Value                                    |
| ----------------- | ---------------------------------------- |
| **Primary actor** | Teacher · **Goal** Control intake timing |

1. Actor toggles `enrollment_status` on an assigned group (FR-GRP-05, BR-10).
2. System writes an audit entry (`ENROLLMENT_TOGGLED`, BR-62).
3. Closing hides the group from browsing but leaves existing pending requests reviewable (FR-REQ-09, DEC-C06).

**Exception flows** — E1. Group is `Archived` → the toggle has no effect; archived dominates (BR-42). E2. Not the assigned Teacher → HTTP 403.

---

### UC-15 — Dispatch Daily Reminder _(NEW — DEC-D04)_

| Field             | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| **Primary actor** | Scheduler (A-06) · **Goal** Prompt students who have not yet reported |

1. At each 20:00 local boundary, system selects Students whose local time has reached 20:00.
2. System excludes: today is the group's recitation day; group is `Archived`; a report already exists for today; the category is muted (FR-NOTIF-03, FR-NOTIF-05).
3. System dispatches a push carrying event type only, no personal data (BR-46).
4. System records the outcome (FR-NOTIF-08).

**Exception flows** — E1. No valid device token → skip; log; never block. E2. Transport rejects the token → invalidate it (E-09). E3. Dispatch fails entirely → **the student is still responsible**; non-delivery never excuses a missed report (BR-60).

---

### UC-16 — Recover Removed Student Data _(NEW — DEC-B10)_

| Field             | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| **Primary actor** | Admin · **Goal** Inspect or restore soft-deleted records |

1. Actor opens the terminated Membership.
2. System displays the retained reports, weekly reports and payment records.
3. Actor may export or restore.

⚠️ **OPEN ISSUE — ISS-10**: "restore" is undefined. Restoring data does **not** re-create a Membership, and DEC-C02 forbids reviving one. Recovery is therefore read/export only unless the stakeholder specifies otherwise. Low; see §29.

---

### UC-17 — Promote a User to Staff

| Field             | Value                                          |
| ----------------- | ---------------------------------------------- |
| **Primary actor** | Admin · **Goal** Create a Teacher or Assistant |

1. Actor selects a user with `role = User` (BR-R03).
2. Actor selects the target role.
3. System updates `User.role`.

**Exception flows** — E1. Target holds any role other than `User` → blocked. A Student must be removed first (which reverts them to `User`). E2. Target is the Admin → blocked (FR-ADMIN-02).

---

### UC-18 — Manage Notification Preferences _(NEW — DEC-D04)_

| Field             | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| **Primary actor** | Any authenticated user · **Goal** Mute non-critical categories |

1. Actor opens notification settings.
2. System lists categories with current mute state, marking account-critical ones as locked (FR-NOTIF-06, BR-61).
3. Actor toggles a mutable category.

**Exception flows** — E1. Attempt to mute an account-critical category → blocked server-side, not merely hidden in the UI (NFR-08).

---

## 13. Permission Model

### 13.1 Correction applied to the SRS matrix

SRS §10 lists a single resource "Role promotion — Admin: U", yet FR-REQ-05 has the Assistant change `User.role` from `User` to `Student` on acceptance (CON-10). These are different powers with different risk profiles and must not share a row:

| Resource                     | Meaning                                               | Who                                                       |
| ---------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| **Administrative promotion** | `User` → `Teacher` / `Assistant`                      | Admin only (BR-R03)                                       |
| **Enrollment promotion**     | `User` → `Student`, and `Student` → `User` on removal | Assistant (accept, FR-REQ-05); Admin (removal, FR-GRP-07) |

### 13.2 RBAC matrix

**Legend** — C create · R read · U update · D delete · A approve/decide · M manage (full) · — no access · **(own)** scoped per §14

| Resource                     | Admin        | Teacher                    | Assistant                  | Student    | User                                     |
| ---------------------------- | ------------ | -------------------------- | -------------------------- | ---------- | ---------------------------------------- |
| Own account                  | R U          | R U                        | R U                        | R U        | R U                                      |
| Other user accounts          | R U          | R name+gender (own groups) | R name+gender (own groups) | —          | —                                        |
| **Administrative promotion** | U            | —                          | —                          | —          | —                                        |
| **Enrollment promotion**     | U (removal)  | —                          | U (acceptance)             | —          | —                                        |
| Group                        | C R U D\*    | R (own)                    | R (own)                    | R (own)    | R (Open + Active + gender match)         |
| Group enrollment toggle      | —            | U (own)                    | —                          | —          | —                                        |
| Group lifecycle (archive)    | U            | —                          | —                          | —          | —                                        |
| Teacher/Assistant assignment | C U D        | —                          | —                          | —          | —                                        |
| Join Request                 | R (all)      | —                          | R A (own groups)           | —          | C R (own, **status only** while pending) |
| Membership                   | R D†         | R (own groups)             | C‡ (own groups)            | R (own)    | —                                        |
| Daily Report                 | R (all)      | R (own groups)             | **—**                      | C R (own)  | —                                        |
| Weekly Report                | R (all)      | R (own groups)             | **—**                      | R U§ (own) | —                                        |
| Memorization coverage        | R (all)      | R (own groups)             | **—**                      | R (own)    | —                                        |
| Performance dashboards       | R (all)      | R (own groups)             | **—**                      | R (own)    | —                                        |
| Payment record               | R (all)      | **—**                      | R C (own groups)           | R (own)    | —                                        |
| Notification preferences     | R U (own)    | R U (own)                  | R U (own)                  | R U (own)  | R U (own)                                |
| Device token                 | C D (own)    | C D (own)                  | C D (own)                  | C D (own)  | C D (own)                                |
| Audit log                    | R            | —                          | —                          | —          | —                                        |
| Soft-deleted records         | R (recovery) | —                          | —                          | —          | —                                        |
| Quran reference data         | R            | R                          | R                          | R          | R                                        |

\* **D on Group** only when the group has never had a Membership (BR-43).
† **D on Membership** is termination, never physical deletion (BR-05a).
‡ The Assistant creates a Membership only as the effect of accepting a join request; there is no direct create.
§ The Student's only Weekly Report write is the attendance checkbox, once, on the recitation day.

### 13.3 Permissions confirmed by decision, not assumed

| Permission                                                        | Basis                                 |
| ----------------------------------------------------------------- | ------------------------------------- |
| Assistant has **no** access to reports, coverage or performance   | DEC-B09 ✅ CONFIRMED (closes OPEN-06) |
| Teacher has **no** access to payments                             | SRS §10 ✅ CONFIRMED                  |
| Admin reads report content and performance across **all** groups  | DEC-C07 ✅ CONFIRMED                  |
| Admin cannot remove or demote themselves                          | DEC-C07 ✅ CONFIRMED                  |
| No role may edit or delete any report                             | BR-22, §10 notes ✅ CONFIRMED         |
| Teacher's only write in the whole system is the enrollment toggle | SRS §10 ✅ CONFIRMED                  |
| A pending applicant sees status only                              | DEC-C09 ✅ CONFIRMED                  |

### 13.4 Permission enforcement requirements

| ID                  | Requirement                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NFR-08** (SRS)    | Server-side authorisation on every endpoint. UI hiding is never the sole control.                                                                                              |
| **NFR-19** (NEW 💡) | Scope filters (§14) shall be applied in the data-access layer, not in controllers, so that a new endpoint cannot accidentally omit them.                                       |
| **NFR-20** (NEW 💡) | A request for a resource outside the actor's scope shall return the same status for "does not exist" and "not permitted", so that scope cannot be used to enumerate resources. |

---

## 14. Data Access Rules

RBAC answers _what kind of thing_ a role may touch. This section answers _which instances_. Both must pass.

### 14.1 Scope definitions

```
scope(Admin)      = everything, including soft-deleted records

scope(Teacher)    = { g : g.teacher_id = actor.id }
                  ∪ { m : m.group_id ∈ scope_groups(actor) }
                  ∪ { reports, weekly reports, coverage of those memberships }

scope(Assistant)  = { g : g.assistant_id = actor.id }
                  ∪ { jr : jr.group_id ∈ scope_groups(actor) }
                  ∪ { m, payment records of those memberships }
                  ✗ reports, weekly reports, coverage, performance

scope(Student)    = { m : m.user_id = actor.id AND m.state = Active }
                  ∪ { reports, weekly reports, coverage, payments of that membership }
                  ∪ { g : g = m.group_id }  (read-only, limited fields)

scope(User)       = { own account, own join requests }
                  ∪ { g : g.enrollment_status = Open
                          AND g.lifecycle_state = Active
                          AND g.gender = declared gender }
```

### 14.2 Per-role access detail

**Student** may access: own profile · own daily reports · own weekly reports · own commitment score and progress · own payment status, arrears and next due date · limited fields of their own group (name, recitation day, enrollment status). May **not** access: any other student's data · group-level aggregates · staff identities beyond what the UI needs · their own terminated memberships.

**Teacher** may access: assigned groups · every Membership in those groups whose active window intersects the requested period, **including terminated ones for historical periods** (FR-PERF-09) · daily reports, weekly reports, coverage and performance for those memberships · student `full_name` and `gender`. May **not** access: unassigned groups (AC-17) · payment data · restricted personal data (phone, age, occupation, city — NFR-10) · join requests.

**Assistant** may access: assigned groups · join requests for those groups **including full applicant profiles with restricted personal data** (NFR-10) · Memberships in those groups · payment records and derived cycle ledgers. May **not** access: report content · weekly reports · coverage · any performance figure (DEC-B09) · groups they do not support.

**Admin** may access everything, including soft-deleted records and the audit log. May **not**: edit or delete any report; create another Admin; remove or demote themselves.

**User** may access: own account · own join requests (status only while pending, DEC-C09) · the filtered public group list. May **not** access: group membership lists · any report · any other applicant's data or score.

### 14.3 Scope transition rules

| Event                    | Scope effect                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Join accepted            | Applicant gains Student scope over the new Membership; loses User scope for group browsing                                                                                 |
| Student removed          | Loses all Student scope **immediately**; the terminated Membership is out of their own scope, but remains inside the Teacher's historical scope and the Admin's full scope |
| Staff reassigned (UC-11) | Incoming staff gains full scope over the group **including historical reports**; outgoing loses it immediately (⚠️ ISS-04)                                                 |
| Group archived           | Teacher and Assistant retain read scope; Students retain read scope but lose all write actions                                                                             |
| Role demoted             | Blocked while assigned (BR-44); once permitted, scope collapses to User immediately                                                                                        |

### 14.4 Personal-data scoping (NFR-10)

| Field                                       | Admin | Assistant       | Teacher         | Student (own) |
| ------------------------------------------- | ----- | --------------- | --------------- | ------------- |
| `full_name`                                 | ✅    | ✅              | ✅              | ✅            |
| `gender`                                    | ✅    | ✅              | ✅              | ✅            |
| `email`                                     | ✅    | ⚠️ ISS-11       | ❌              | ✅            |
| `phone_number`, `age`, `occupation`, `city` | ✅    | ✅ (reviewing)  | ❌              | ✅            |
| Report content                              | ✅    | ❌              | ✅ (own groups) | ✅            |
| Payment data                                | ✅    | ✅ (own groups) | ❌              | ✅            |

⚠️ **ISS-11**: NFR-10 lists phone, age, occupation and city as restricted, and is silent on `email`. Since the Assistant contacts applicants offline, email visibility is plausible but unstated. Low severity.

---

## 15. Validation Rules

Business validation encodes a rule the business chose. Technical validation encodes a rule the system needs to remain correct. Both are enforced server-side (NFR-08); client-side checks are a usability aid only.

### 15.1 Registration and account

| ID        | Rule                                                                                                                        | Class                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| VR-01     | Email must be RFC-5322 valid and unique.                                                                                    | Technical                |
| VR-02     | Password minimum 8 characters.                                                                                              | Business                 |
| **VR-28** | `timezone` must be a valid IANA identifier; if absent or unrecognised, default to the center timezone and flag for refresh. | Technical (NEW, DEC-B03) |
| **VR-29** | A device token must be unique per `(user, token)`; re-registration refreshes rather than duplicates.                        | Technical (NEW)          |

### 15.2 Join application

| ID         | Rule                                                                                                              | Class                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------- |
| VR-03      | All applicant profile fields are mandatory.                                                                       | Business                    |
| VR-04      | ❌ SUPERSEDED by VR-04a.                                                                                          | —                           |
| **VR-04a** | `memorized_ahzab` must be a set of distinct integers in 1–60 with cardinality between **5 and 60** inclusive.     | Business (NEW, DEC-D01/D07) |
| VR-05      | `phone_number` must match the Tunisian format.                                                                    | Business                    |
| VR-06      | `fee_agreement` must be `true`.                                                                                   | Business                    |
| VR-07      | `program_goal` must be `Memorization`; `Revision` blocks submission with an explanatory message.                  | Business                    |
| VR-08      | The selected group's gender must equal the declared gender. Enforced **server-side**, not only by list filtering. | Business                    |
| VR-09      | Submission is blocked if the user already holds a `Pending` request or has an Active Membership.                  | Business                    |
| **VR-34**  | The selected group must be `Open` **and** `Active` at the moment of submission, re-checked server-side.           | Business (NEW, FR-JOIN-03a) |
| —          | `age` has **no** validation beyond being a positive integer.                                                      | ✅ DEC-D06                  |

### 15.3 Daily report

| ID         | Rule                                                                                                                                           | Class                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| VR-10      | `report_date` must equal the current date in the student's **persisted** timezone.                                                             | Business (amended by DEC-B03)  |
| VR-11      | Reject if a report already exists for that membership and date.                                                                                | Technical (unique constraint)  |
| VR-12      | Reject if the current day is the group's recitation day.                                                                                       | Business                       |
| VR-13      | Surah number 1–114; ayah number valid for that surah per the reference dataset.                                                                | Technical                      |
| VR-14      | The "to" position must be ≥ the "from" position.                                                                                               | Technical                      |
| **VR-14a** | Within a single report, a range must be expressed in mushaf order (`end.ordinal ≥ start.ordinal`). Direction **across** days is unconstrained. | Business (NEW, DEC-D02, BR-52) |
| VR-15      | `memo_time_to` must be later than `memo_time_from`; same for revision times.                                                                   | Technical                      |
| VR-16      | Memorization time is required when a memorized portion is provided, and forbidden otherwise.                                                   | Business                       |
| VR-17      | Revision time is required when a revision portion is provided, and forbidden otherwise.                                                        | Business                       |
| VR-18      | `repetitions_in_single_session` may only be `true` when `completed_50_repetitions` is `true`.                                                  | Business                       |
| VR-19      | `absence_reason` is required when `type = Absent`.                                                                                             | Business                       |
| VR-20      | Revision range is required when `type = Revision`.                                                                                             | Business                       |
| **VR-35**  | Reject if the membership is not `Active` or the group is `Archived`.                                                                           | Business (NEW, FR-DR-11)       |
| —          | A `Normal` report with neither memorization nor revision is **valid**.                                                                         | ✅ BR-48, DEC-B08              |

### 15.4 Weekly report

| ID        | Rule                                                                                | Class                         |
| --------- | ----------------------------------------------------------------------------------- | ----------------------------- |
| VR-21     | Submission permitted only on the group's recitation day, in the student's timezone. | Business                      |
| VR-22     | Reject if a weekly report already exists for that membership and week.              | Technical (unique constraint) |
| **VR-36** | Reject any write to a report already in state `Finalised`.                          | Technical (NEW, FR-WR-07)     |

### 15.5 Group

| ID        | Rule                                                                                                                    | Class                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------- |
| VR-23     | Teacher and Assistant must be assigned at creation and cannot be null.                                                  | Business              |
| VR-24     | The assigned Teacher must hold role `Teacher`; the assigned Assistant must hold role `Assistant`.                       | Business              |
| VR-25     | `recitation_day` is write-once.                                                                                         | Business              |
| **VR-30** | Deletion is rejected if any Membership has ever existed for the group.                                                  | Business (NEW, BR-43) |
| **VR-31** | Demotion or removal of a user assigned to any non-archived group is rejected, naming the groups requiring reassignment. | Business (NEW, BR-44) |

### 15.6 Membership

| ID        | Rule                                                          | Class                            |
| --------- | ------------------------------------------------------------- | -------------------------------- |
| **VR-32** | At most one Membership per user may be in state `Active`.     | Technical (partial unique index) |
| **VR-33** | At creation, the group's gender must equal the user's gender. | Business (NEW, BR-08)            |

### 15.7 Payment

| ID        | Rule                                                                                                                                          | Class                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| VR-26     | A cycle may be marked paid only once.                                                                                                         | Technical (unique on `membership_id, cycle_index`) |
| VR-27     | Only the Assistant of that student's group may record the payment.                                                                            | Business                                           |
| **VR-37** | `cycle_index` must correspond to a cycle that has actually started — i.e. `0 ≤ index ≤ current_cycle_index`. Future cycles cannot be prepaid. | Business (NEW) 💡                                  |

### 15.8 Notifications

| ID        | Rule                                                                                   | Class                  |
| --------- | -------------------------------------------------------------------------------------- | ---------------------- |
| **VR-38** | An attempt to mute an account-critical category is rejected server-side.               | Business (NEW, BR-61)  |
| **VR-39** | A notification payload must contain no personal data, report content, score or amount. | Technical (NEW, BR-46) |

### 15.9 Validation classes summary

| Class                | Count | Enforcement point                                                                                    |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| Business validation  | 24    | Application/domain layer; message is user-facing and in Arabic                                       |
| Technical validation | 15    | Database constraints where possible (unique indexes, check constraints), application layer otherwise |

💡 **RECOMMENDATION** — VR-11, VR-22, VR-26, VR-32 and VR-01 must be database constraints, not application checks. Each guards against a **concurrent** duplicate that an application-level read-then-write cannot prevent (see UC-03 E2, UC-05 E4).

---

## 16. Business Processes

### 16.1 Enrollment process

```
 User registers ──▶ declares gender ──▶ browses filtered groups ──▶ applies
                                                                      │
                                            score computed, status = Pending
                                                                      │
                                                       Assistant notified (N-05)
                                                                      │
                                            ┌─────────────────────────┴──────┐
                                         accept                            reject
                                            │                                │
        role → Student                      │                     status = Rejected
        name + gender copied to User         │                     applicant notified
        Membership created (started_at)      │                     may reapply at once
        Coverage seeded from ahzab           │
        payment cycle 0 begins               │
        applicant notified (N-03)            │
                                             ▼
                                    reporting begins next
                                    non-recitation day
```

Owner: Assistant. Trigger: applicant submission. Outcome: an Active Membership or a terminal rejection.

### 16.2 Weekly reporting cycle

```
 recitation day D0
      │
      ├─ WeeklyReport for the week ending D0 is created/finalised
      │
      ▼
 D0+1 ── D0+6 : six memorization days
      │         one Daily Report expected per day
      │         reminder at 20:00 local if not yet submitted
      │         submission window closes at local midnight, no backdating
      ▼
 D0+7 = next recitation day
      │
      ├─ Daily report submission BLOCKED (VR-12)
      ├─ WeeklyReport generated from the 6 preceding days
      ├─ Student confirms attendance, or Scheduler finalises at midnight
      ▼
   repeat
```

Owner: Student, with the Scheduler as fallback. This loop is where the primary success metric (80% submission over 4 weeks) is won or lost.

### 16.3 Payment cycle

```
 membership.started_at = C0
      │
      ├─ cycle 0 : [C0, C0 + 3mo − 1d]         status derived, never stored
      │      └─ within 10 days of end → Due Soon (current cycle only)
      │      └─ Assistant records payment → PaymentRecord(cycle_index = 0)
      │
      ├─ cycle 1 : [C0 + 3mo, C0 + 6mo − 1d]   opens automatically whether or
      │                                          not cycle 0 was paid (BR-54)
      ▼
   … stops at min(today, membership.ended_at, group.archived_at)

   Student view : next due = end of OLDEST unpaid cycle
                  arrears  = count of unpaid cycles already ended
```

Owner: Assistant. No system action is required to advance a cycle — advancement is arithmetic.

### 16.4 Removal and rejoin

```
 Admin removes student
      │
      ├─ membership.state = Terminated, ended_at = today
      ├─ reports / weekly reports / payments / join request soft-deleted
      ├─ User.role = User
      ├─ student notified (N-08)
      ▼
 account may reapply immediately (BR-04)
      │
      ▼
 acceptance creates a NEW Membership
      ├─ coverage re-seeded from the NEW application's ahzab selection
      ├─ zero reports, zero weekly reports, cycle 0 restarts
      └─ prior membership remains visible to Admin only
```

**Consequence worth stating plainly:** because rejoin starts fresh (DEC-C02), a student's declared `memorized_ahzab` on the _second_ application is what seeds their coverage — not their accumulated first-membership coverage. The center therefore relies on the applicant to declare honestly, exactly as at first enrollment.

### 16.5 Group retirement

```
 Admin archives group
      ├─ lifecycle_state = Archived, archived_at = today
      ├─ pending requests auto-rejected (resolution_source = System)
      ├─ daily reporting blocked, weekly generation stops
      ├─ payment cycles stop advancing
      └─ students REMAIN enrolled; Teacher/Assistant retain read access
```

---

## 17. Daily Report System

### 17.1 The three report types

| Type       | Meaning                                                         | Captures                                                                    | Memorization expected?                    | Revision expected?             |
| ---------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| `Normal`   | An ordinary memorization day                                    | Memorization range + time, revision range + time, 50-rep flags, tafsir flag | **Yes**                                   | **Yes** (BR-47)                |
| `Revision` | A day within a Revision Period — focus shifted to consolidation | Revision range only                                                         | **No** (BR-27, BR-28a)                    | **Yes** — inherently satisfied |
| `Absent`   | The student did not participate                                 | Reason: `Sick` / `Studying` / `Other`                                       | Excused if Sick/Studying; missed if Other | Same                           |

### 17.2 Daily Revision versus Revision Period — the critical distinction

This distinction was supplied by the stakeholder (DEC-A08) and is the single most misreadable part of the domain. Stating it precisely prevents a whole class of calculation error:

|                | **Daily Revision**                                            | **Revision Period**                                                                          |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| What it is     | A small consolidation quantity revised **every** expected day | A phase in which the volume is larger and the **focus** shifts from memorization to revision |
| Scope          | A field on a report                                           | A property inferred from a report's type                                                     |
| Obligation     | **Mandatory on every expected day** (BR-47)                   | Voluntary and implicit; no declaration, no approval (BR-28)                                  |
| Represented by | `rev_range` on a `Normal` or `Revision` report                | `type = Revision` (BR-28a)                                                                   |
| Governs        | `missed_daily_revision`, `RevisionRate`                       | The BR-27 exclusion from `MemorizationRate` **only**                                         |
| Duration       | One day                                                       | Unbounded; no cap in MVP (BR-49, DEC-D08)                                                    |

**The two are orthogonal.** A `Revision`-type day simultaneously _satisfies_ daily revision and _excuses_ memorization. A `Normal`-type day with `no_revision_today = true` is a `missed_daily_revision` **even though memorization occurred**. Conflating them would either wrongly penalise students in a revision period or wrongly excuse students skipping their daily revision.

### 17.3 Day classification — the single input to every metric

Every weekly and dashboard metric consumes exactly one value per expected day (VO-09):

```
classify(membership m, date d) →

  if no DailyReport(m, d)                        → NO_REPORT
  if report.type = Absent
       and reason ∈ {Sick, Studying}             → ABSENT_EXCUSED
  if report.type = Absent and reason = Other     → ABSENT_OTHER
  if report.type = Revision                      → REVISION
  if report.type = Normal                        → NORMAL
```

Deriving every metric from this one function guarantees the metrics cannot disagree with each other — the class of bug that CON-01 and CON-07 represented in the source SRS.

### 17.4 Should Report, MemorizationRecord and RevisionRecord be separate entities?

**Analysis.** A child entity is justified by independent identity, independent lifecycle, or cardinality greater than one.

| Test                                 | Memorization data                                           | Revision data    |
| ------------------------------------ | ----------------------------------------------------------- | ---------------- |
| Cardinality per report               | Exactly **0..1** (§9.5 provides one range, one time window) | Exactly **0..1** |
| Independent identity                 | None — meaningless outside its report                       | None             |
| Independent lifecycle                | None — immutable with the parent (BR-22)                    | None             |
| Queried independently of the parent? | Only in aggregate, always filtered by membership and date   | Same             |

**Conclusion.** ✅ Memorization and revision data are **embedded value objects on DailyReport**, not entities. Separating them would add two joins to the hottest read path (the group dashboard reads every report in a period) in exchange for no expressive power.

**But one separation _is_ justified — and for a different reason.** `MemorizationCoverage` (E-08) is separate not because memorization data is a child entity, but because **coverage is a fold over the entire history** with its own update semantics (merge, absorb, never shrink). Recomputing it from scratch on every dashboard render would be O(all reports ever) per request. This is a projection, not a normalisation of the report.

💡 **RECOMMENDATION** — if a future release allows multiple memorization ranges per day (a plausible evolution), that changes cardinality to 0..N and **does** justify promoting the value object to an entity. Recorded in §32.

### 17.5 Tafsir

`read_tafsir` is a boolean on `Normal` reports (§9.5, §1.3). ⏳ **It feeds no metric.** It appears in no weekly metric (§9.6), in no dashboard element (§9.4.1, §9.4.2) and in no Commitment Score component (§9.4.3). It is captured and visible on the raw report only.

⚠️ **OPEN ISSUE — ISS-12**: either tafsir is intended as informational only, or a dashboard element is missing. Low severity, but it should be a conscious choice rather than an omission.

### 17.6 Memorization Progress Engine

**Purpose.** Convert submitted ayah ranges into hizb-level progress, given that memorization order is arbitrary (BR-50).

**Canonical ordinal.** From the reference dataset (E-13), each `(surah, ayah)` maps to a global ordinal:

```
ordinal(s, a) = surah[s].ordinal_offset + a          where ordinal ∈ [1, T]
```

`ordinal_offset` is the cumulative ayah count of all preceding surahs. The mapping is computed once at deployment.

**Coverage.** For a Membership, coverage is the union of all memorization intervals ever submitted, stored as a normalised set of disjoint, non-adjacent intervals (VO-07).

```
insert(coverage, [lo, hi]):
    candidates ← intervals overlapping or adjacent to [lo, hi]
    merged     ← [ min(lo, min start of candidates),
                   max(hi, max end   of candidates) ]
    coverage   ← (coverage − candidates) ∪ { merged }
```

**Why this handles every case the stakeholder described:**

| Memorization pattern                                    | Handling                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Front-to-back                                           | Intervals extend rightward and merge into one block                |
| Back-to-front                                           | Intervals extend leftward and merge into one block                 |
| Middle start, forward                                   | Identical — direction is never stored                              |
| Middle start, backward                                  | Identical                                                          |
| **Skip an already-memorized stretch, resume elsewhere** | A second disjoint interval simply appears. **No rule is required** |
| Re-memorizing an overlapping portion                    | Union absorbs it; nothing is double-counted                        |

**Derived figures:**

```
ahzab_completed        = |{ h ∈ 1..60 : [h.start_ordinal, h.end_ordinal] ⊆ coverage }|
coverage_percent       = ( Σ interval lengths ) / T × 100
last_memorized_position = end position of the MOST RECENT memorization submission
```

**`last_memorized_position` is an activity pointer, not a progress pointer** (DEC-D02). Under non-linear memorization it says _where the student worked last_, and implies nothing about how far they have advanced. The UI must present it as such; presenting it as "progress" would be actively misleading for a back-to-front student.

**Seeding.** At membership creation, coverage is initialised to the union of the hizb intervals corresponding to `memorized_ahzab` (BR-53, FR-REQ-05b). Because the applicant selects _which_ ahzab rather than _how many_, seeding is exact regardless of the order in which they memorized them — this is precisely why DEC-D01 replaced the bare integer.

**Complexity.** Insert is O(log n + k) with an interval index, where k is the number of merged neighbours; k is almost always 0 or 1. Coverage never exceeds 60 hizb boundaries' worth of fragmentation in practice, so `ahzab_completed` is a 60-iteration containment check.

---

## 18. Weekly Report Calculation

This section is the formal calculation specification. Every formula is traced to a requirement or a decision. **No formula here is invented**; where the source is insufficient, the gap is marked rather than filled.

### 18.1 Foundational definitions

```
ReportingWeek(group g, date d)                                       -- BR-15
    week_end   = the date of the recitation day of the week containing d
    week_start = week_end − 6 days

EffectiveWindow(membership m)                                        -- FR-WR-09/10, DEC-C03
    [ m.started_at , min( today , m.ended_at ?? ∞ , m.group.archived_at ?? ∞ ) ]

ExpectedDays(m, week w)                                              -- BR-45, DEC-A03
    { d ∈ [w.week_start, w.week_end]
        : d ≠ w.week_end                    -- exclude the recitation day
      AND d ∈ EffectiveWindow(m) }          -- prorate / truncate
    |ExpectedDays| ≤ 6

EffectiveDays(m, w)                                                  -- BR-24
    { d ∈ ExpectedDays(m, w) : classify(m, d) ≠ ABSENT_EXCUSED }

MemorizationExpectedDays(m, w)                                       -- BR-27, BR-28a
    { d ∈ EffectiveDays(m, w) : classify(m, d) ≠ REVISION }
```

Three separate denominators, deliberately. Confusing them is the arithmetic error CON-01 exposed in the source document.

### 18.2 Weekly metric specifications

---

**Metric: `missed_daily_reports`**

|                       |                                                       |
| --------------------- | ----------------------------------------------------- |
| **Input**             | `classify(m, d)` for each `d ∈ EffectiveDays(m, w)`   |
| **Calculation**       | `count( d : classify(d) = NO_REPORT )`                |
| **Excluded**          | Recitation day (BR-45); `ABSENT_EXCUSED` days (BR-24) |
| **Counted as a miss** | `NO_REPORT` only                                      |
| **Source**            | §9.6, BR-23, BR-24 ✅                                 |

---

**Metric: `missed_daily_memorization`**

|                       |                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Input**             | `classify(m, d)` and, for `NORMAL` days, `no_memorization_today`                                                                      |
| **Calculation**       | `count( d ∈ MemorizationExpectedDays : classify(d) ∈ {NO_REPORT, ABSENT_OTHER} OR (classify(d) = NORMAL AND no_memorization_today) )` |
| **Excluded**          | Recitation day; `ABSENT_EXCUSED` days (BR-24); **`REVISION` days** (BR-27, BR-28a)                                                    |
| **Counted as a miss** | Missing report, `ABSENT_OTHER`, and a `Normal` report declaring no memorization (BR-48)                                               |
| **Source**            | §9.6, BR-23, BR-25, BR-27, DEC-A04, DEC-B08 ✅                                                                                        |

---

**Metric: `missed_daily_revision`**

|                  |                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Input**        | `classify(m, d)` and, for `NORMAL` days, `no_revision_today`                                                                                               |
| **Calculation**  | `count( d ∈ EffectiveDays : classify(d) ∈ {NO_REPORT, ABSENT_OTHER} OR (classify(d) = NORMAL AND no_revision_today) )`                                     |
| **Excluded**     | Recitation day; `ABSENT_EXCUSED` days only                                                                                                                 |
| **Not excluded** | **`REVISION` days are NOT excluded** — they inherently satisfy daily revision and so are never misses, but they remain in the denominator (BR-47, DEC-A08) |
| **Source**       | §9.6, BR-47, DEC-A08 ✅                                                                                                                                    |

---

**Metric: `missed_50_repetitions`**

|                                      |                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Input**                            | `completed_50_repetitions` on `NORMAL` days bearing a memorization range                        |
| **Calculation**                      | `count( d : classify(d) = NORMAL AND memo_range present AND completed_50_repetitions = false )` |
| **Denominator for the quality rate** | Days on which memorization actually occurred — not all expected days                            |
| **Excluded**                         | Every day without memorization; excused days; `REVISION` days                                   |
| **Source**                           | §9.6, BR-26 ✅                                                                                  |

---

**Metric: `missed_single_session`**

|                 |                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Input**       | `repetitions_in_single_session`                                                                                   |
| **Calculation** | `count( d : classify(d) = NORMAL AND completed_50_repetitions = true AND repetitions_in_single_session = false )` |
| **Excluded**    | Days where `completed_50_repetitions = false`                                                                     |
| **Source**      | §9.6 + 💡 **RECOMMENDATION**                                                                                      |

💡 **Reasoning for the exclusion.** VR-18 forces `repetitions_in_single_session = false` whenever `completed_50_repetitions = false`. Counting those days would penalise the same failure twice — once in `missed_50_repetitions` and again here. Restricting this metric to days where the 50 repetitions _were_ completed is the only reading in which the two metrics measure different things. ⚠️ Recorded as **ISS-13** (Low) for stakeholder confirmation.

---

**Metric: `attended_recitation_call`**

|                  |                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| **Input**        | Student's checkbox on the recitation day                                                               |
| **Calculation**  | Student-declared boolean; defaults to `false` if the report is not confirmed by student-local midnight |
| **Verification** | None — self-declared and unverifiable (BR-30, RISK-03)                                                 |
| **Source**       | FR-WR-04, FR-WR-06 ✅                                                                                  |

---

### 18.3 Commitment Score

Approved as written in SRS §9.4.3 (DEC-C08), with the period scoping of DEC-A10 and the zero-denominator handling of DEC-B04.

**Period.** All four components are computed over the caller-supplied period `P`, intersected with `EffectiveWindow(m)` (FR-PERF-07).

```
D_eff(P)  = ⋃ EffectiveDays(m, w)              for all reporting weeks w ∩ P
D_memo(P) = ⋃ MemorizationExpectedDays(m, w)   for all reporting weeks w ∩ P
W(P)      = reporting weeks intersecting  P ∩ [m.started_at, today]     -- DEC-A10
```

| Component          | Numerator                                              | Denominator | Undefined when |
| ------------------ | ------------------------------------------------------ | ----------- | -------------- | --- | --- | ------ | ---- |
| `SubmissionRate`   | days in `D_eff` bearing any report                     | `           | D_eff(P)       | `   | `   | D_eff  | = 0` |
| `MemorizationRate` | days in `D_memo` with memorization recorded            | `           | D_memo(P)      | `   | `   | D_memo | = 0` |
| `RevisionRate`     | days in `D_eff` with revision recorded                 | `           | D_eff(P)       | `   | `   | D_eff  | = 0` |
| `AttendanceRate`   | finalised weekly reports in `W` with `attended = true` | `           | W(P)           | `   | `   | W      | = 0` |

```
defined  = { c ∈ {Submission, Memorization, Revision, Attendance} : c is defined }

CommitmentScore = ( Σ c∈defined  c ) / |defined|            if |defined| > 0
                = null  →  UI shows "not enough data"       if |defined| = 0
```

**A component is never treated as 0** (DEC-B04). Doing so would punish a legitimately sick student, contradicting BR-24.

**Separate quality indicator** (§9.4.1 element 4, deliberately **not** folded in):

```
RepetitionQuality = days with memorization AND completed_50_repetitions
                  / days with memorization                              × 100
```

Kept separate so that consistency and quality remain independently readable (§9.4.3 note ✅).

### 18.4 At-risk detection

Single definition (DEC-B05), governing §9.4.1 element 6, §9.4.2 element 3 and AC-15:

```
AtRisk(m) ⟺ the last 3 expected days within EffectiveWindow(m), evaluated
             backwards from today, all classify as NO_REPORT

  · Recitation days are skipped, not counted
  · ABSENT_EXCUSED counts as REPORTED and therefore BREAKS the streak
  · ABSENT_OTHER counts as REPORTED (a report exists) and BREAKS the streak
  · Terminated memberships are excluded entirely (FR-PERF-10, DEC-C04)
```

The individual dashboard's "days since last report" uses the **same** expected-day counting, not raw calendar days, so the two dashboards can never disagree (closing CON-07).

### 18.5 Payment derivation

No cycle rows are stored (ADR-006). Given `C0 = membership.started_at`:

```
cycle(i)      = [ C0 + 3i months ,  C0 + 3(i+1) months − 1 day ]
cycle_count   = number of cycles whose start ≤ min(today, ended_at, archived_at)   -- FR-PAY-12
current_index = the cycle containing today

status(i) = Paid       if ∃ PaymentRecord(membership, i)
          = Due Soon   if i = current_index
                          AND today ≥ cycle(i).end − 10 days                        -- BR-33, BR-55
          = Unpaid     otherwise

next_due_date = cycle( min{ i : status(i) ≠ Paid } ).end                            -- DEC-B06
arrears_count = |{ i : status(i) ≠ Paid  AND  cycle(i).end < today }|
```

`Due Soon` is a property of the **current cycle only**. Older unpaid cycles are `Unpaid` and are surfaced through `arrears_count` rather than a fourth enum value.

⚠️ **ISS-14 (Low)** — "3 months" is calendar arithmetic. A membership starting 30 November produces a cycle ending 28/29 February. The end-of-month convention (clamp to last valid day vs roll forward) is undefined. Recommend clamping.

### 18.6 Applicant Score

Approved as written (§9.3), with the input redefined by DEC-D01 and the range corrected:

```
Score = ( |memorized_ahzab| / 60 ) × 50
      + TajweedLevel
      + TheoreticalTajweed
      + Qalun

TajweedLevel        : Beginner = 5,  Intermediate = 15,  Advanced = 25
TheoreticalTajweed  : Yes = 10,      No = 0
Qalun               : Yes = 15,      No = 0
```

**Range correction (CON-09).** The SRS states 0.83 → 100. With the mandatory minimum of 5 ahzab (BR-57) and the mandatory TajweedLevel term:

```
minimum = (5/60) × 50 + 5 + 0 + 0 = 4.167 + 5 = 9.17
maximum = 50 + 25 + 10 + 15       = 100
```

**Corrected range: 9.17 → 100.** The published 0.83 omitted the TajweedLevel term entirely. AC-05 must be tested against the corrected figure.

The score is a **sorting aid only** — it never auto-accepts or auto-rejects (§9.3 ✅). It is snapshotted at submission so that historical ordering remains reproducible if the formula changes (BR-38).

### 18.7 Computation timing

| Metric                               | When computed                | Where stored         | Rationale                                                                                   |
| ------------------------------------ | ---------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| Weekly metrics — before finalisation | On read                      | Not stored           | Inputs may still change today                                                               |
| Weekly metrics — at finalisation     | Once                         | Snapshotted on E-06  | Inputs are immutable and non-backdatable, so recomputation is waste (NFR-12)                |
| Commitment Score                     | On read, per period          | Not stored           | Period is caller-supplied (DEC-A10); any stored value would be wrong for a different filter |
| At-risk flag                         | On read                      | Not stored           | Depends on today's date                                                                     |
| Payment status                       | On read                      | Not stored           | Time-dependent (DEC-A06)                                                                    |
| `ahzab_completed`, coverage          | On write (report submission) | Materialised on E-08 | A fold over all history; recomputing per render is O(all reports)                           |

This table is the practical expression of ADR-003 and ADR-004.

---

## 19. Temporal Rules

Irtaki is time-dependent in a way that most CRUD applications are not: a missed deadline is permanent, unappealable and directly reduces a student's score.

### 19.1 The timezone authority

| ID       | Rule                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-01** | `User.timezone` (IANA) is the **single authority** for every day-boundary evaluation: VR-10, BR-20, BR-15, FR-WR-06 and notification scheduling (DEC-B03). |
| **T-02** | It is captured at registration and refreshed on every authenticated session (FR-AUTH-07).                                                                  |
| **T-03** | The per-request client timezone is **not** trusted for validation. It refreshes the stored value; it does not override it.                                 |
| **T-04** | All timestamps are stored in UTC (NFR-16). Only _dates_ are timezone-derived.                                                                              |
| **T-05** | `DailyReport.submitted_timezone` snapshots the timezone in force at submission, so a `report_date` remains explicable if the user later relocates. 💡      |

### 19.2 Day boundaries

| Boundary                       | Rule                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Daily report submission window | Opens at 00:00 and closes at 23:59:59 in `User.timezone` (FR-DR-02, BR-20)                        |
| Backdating                     | Prohibited without exception (BR-21). No grace period, no late window, no administrative override |
| Forward-dating                 | Prohibited (FR-DR-03)                                                                             |
| Recitation-day block           | Evaluated against the student's local date, not the server's (VR-12)                              |

### 19.3 Week boundaries

```
For a group whose recitation day is R:
    week_end   = the R-dated day
    week_start = week_end − 6 days                         (BR-15)
    expected   = the 6 days from week_start .. week_end−1  (BR-45, DEC-A03)
```

Week boundaries are evaluated per student, in that student's timezone. Because all aggregation is keyed on **dates** rather than instants, two students in different timezones still produce comparable date-keyed rows, so group aggregates never desynchronise. This is what reduces RISK-07 to Low.

### 19.4 Scheduled work

| Job                           | Schedule                                                           | Behaviour                                                        | Requirement          |
| ----------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------- |
| **Weekly finalisation**       | At local midnight for each student whose recitation day just ended | Finalise `Open` weekly reports with `attended = false`           | FR-WR-06, AC-12      |
| **Daily reminder**            | 20:00 in each user's local timezone                                | Dispatch push to Students with no report today                   | FR-NOTIF-02, DEC-D04 |
| **Payment `Due Soon`**        | None required                                                      | Derived at read time (DEC-A06) — no job                          | FR-PAY-04            |
| **Auto-rejection on archive** | Event-driven, not scheduled                                        | Triggered by UC-13                                               | FR-REQ-08            |
| **Coverage reconciliation**   | 💡 Periodic                                                        | Repair coverage after a failed post-submission update (UC-05 E5) | 💡                   |

💡 **RECOMMENDATION** — implement per-timezone jobs by bucketing users by their UTC offset and running each bucket at its own instant, rather than sweeping all users hourly. With a single-country deployment there will realistically be one bucket, but the design must not assume it.

### 19.5 Prorating and truncation

| Situation                                   | Behaviour                                                                                                         | Requirement       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| Membership starts mid-week                  | Expected days counted from `started_at`                                                                           | FR-WR-09, DEC-A07 |
| Membership terminated mid-week              | Expected days truncated at `ended_at`                                                                             | FR-WR-10          |
| Group archived mid-week                     | Expected days truncated at `archived_at`; no further weeks                                                        | FR-WR-10, DEC-C03 |
| Membership starts **on** the recitation day | `expected_days = 0`; the weekly report exists with all metrics zero and contributes nothing to any rate (DEC-B04) | EC-13             |

### 19.6 Failure of time-driven behaviour

| Failure                       | Required behaviour                                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalisation job does not run | On the next successful run, finalise all overdue `Open` reports with `attended = false`. **Never** allow retroactive confirmation, since that would let a student claim attendance days later (BR-30) |
| Reminder job does not run     | No compensating action. Non-delivery never excuses a missed report (BR-60)                                                                                                                            |
| Job runs twice                | Finalisation must be idempotent — a `Finalised` report is never rewritten (VR-36)                                                                                                                     |
| Clock skew across servers     | Date derivation must use a single authoritative clock source ⚠️ ISS-15 (Low)                                                                                                                          |

### 19.7 Temporal rules that remain undefined

| ID        | Undefined                                                               | Impact                                                                  |
| --------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ⚠️ ISS-14 | End-of-month arithmetic for 3-month payment cycles                      | Low — affects cycle end dates for memberships starting on the 29th–31st |
| ⚠️ ISS-15 | Authoritative clock source and tolerated skew                           | Low                                                                     |
| ⚠️ ISS-09 | Whether an archived interval counts as excluded days after un-archiving | Low                                                                     |

---

## 20. Data Lifecycle

### 20.1 Lifecycle matrix

| Entity                   | Creation                        | Activation                     | Modification                                                       | Deactivation         | Deletion                                   | History retained?            |
| ------------------------ | ------------------------------- | ------------------------------ | ------------------------------------------------------------------ | -------------------- | ------------------------------------------ | ---------------------------- |
| **User**                 | Self-registration; Admin seeded | Immediate                      | Credentials, timezone, prefs by self; role by Admin                | None                 | **Never**                                  | Full                         |
| **Group**                | Admin (UC-10)                   | Immediate, `Closed` + `Active` | Name and staff by Admin; enrollment by Teacher; lifecycle by Admin | `Archived` (UC-13)   | Only if no Membership ever existed (BR-43) | Full                         |
| **Membership**           | On join acceptance              | Immediate, `Active`            | Termination only                                                   | `Terminated` (UC-12) | **Never** (BR-05a)                         | Full                         |
| **JoinRequest**          | User submission                 | `Pending`                      | Status only, once                                                  | Terminal on decision | **Never** — soft-deleted with membership   | Full                         |
| **DailyReport**          | Student submission              | Immediate, immutable           | **Never** (BR-22)                                                  | —                    | **Never** — soft delete only               | Full                         |
| **WeeklyReport**         | System, on recitation day       | `Open` → `Finalised`           | Attendance checkbox once                                           | Finalisation         | **Never** — soft delete only               | Full                         |
| **PaymentRecord**        | Assistant records               | Immediate                      | **Never** ⚠️ ISS-02                                                | —                    | **Never** — soft delete only               | Full                         |
| **MemorizationCoverage** | With Membership                 | Immediate, seeded              | On each memorization submission                                    | With membership      | **Never**                                  | Current state only ⚠️ ISS-16 |
| **DeviceToken**          | On login                        | Immediate                      | `last_seen_at`                                                     | Invalidated          | Physical delete permitted                  | None needed                  |
| **NotificationLog**      | On dispatch                     | —                              | **Never**                                                          | —                    | Retention policy ⚠️ ISS-08                 | Bounded                      |
| **AuditEntry**           | On audited action               | —                              | **Never**                                                          | —                    | **Never**                                  | Full                         |

### 20.2 Soft deletion (DEC-B10)

**Scope.** On membership termination, `deleted_at` is stamped on: every DailyReport, every WeeklyReport, every PaymentRecord, the MemorizationCoverage, and the originating JoinRequest for that Membership.

**Query semantics.**

| Caller                                  | Sees soft-deleted rows?                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Student, Teacher, Assistant, User       | **No**, in every query without exception                                         |
| Teacher, historical group aggregates    | **Yes**, but only for the period the membership was active (FR-PERF-09, DEC-C04) |
| Teacher, current-week and at-risk views | **No** (FR-PERF-10)                                                              |
| Admin, ordinary views                   | No                                                                               |
| Admin, recovery view (UC-16)            | Yes                                                                              |

⚠️ The Teacher case is the subtle one: the same Teacher, on the same screen, sees a removed student in a _historical_ period and not in the _current_ week. This is intentional (past dashboards must remain reproducible) and must be implemented as a **period-aware** filter, not a global one.

💡 **RECOMMENDATION** — implement soft-delete filtering as a default query scope in the data-access layer with an explicit opt-out for the two exceptions, rather than as a `WHERE deleted_at IS NULL` clause repeated across the codebase (NFR-19).

### 20.3 What survives removal, and what does not

| Data                               | Survives?                                                                         | Visible to                                    |
| ---------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| User account and email             | ✅ Yes — `role` reverts to `User`                                                 | Everyone as normal                            |
| `full_name`, `gender` on User      | ✅ Yes (DEC-A05)                                                                  | As per §14.4                                  |
| Daily reports, weekly reports      | ✅ Retained, hidden                                                               | Admin recovery; Teacher historical aggregates |
| Payment records                    | ✅ Retained, hidden                                                               | Admin recovery                                |
| Memorization coverage              | ✅ Retained, hidden                                                               | Admin recovery                                |
| Join request and applicant profile | ✅ Retained, hidden                                                               | Admin recovery                                |
| **Effect on a rejoining student**  | ❌ **Nothing carries forward** — a new Membership starts at zero (DEC-C02, BR-40) | —                                             |

**AC-20 remains testable.** The observable behaviour — a removed student's reports and payments are gone from every user-facing surface — is unchanged. Only the underlying mechanism differs.

### 20.4 Historical data availability

| Question                                                           | Answer                                       | Basis   |
| ------------------------------------------------------------------ | -------------------------------------------- | ------- |
| Should a removed student's history remain available to the center? | ✅ Yes, to the Admin                         | DEC-B10 |
| Should it remain in the Teacher's historical dashboards?           | ✅ Yes, for the active period only           | DEC-C04 |
| Should it be carried into a new enrollment?                        | ❌ No                                        | DEC-C02 |
| Should archived groups' history remain queryable?                  | ✅ Yes — archival stops activity, not access | DEC-C03 |
| Is there a data retention limit?                                   | ⚠️ Undefined — ISS-08                        | —       |

### 20.5 Open lifecycle issues

| ID         | Issue                                                                                                                                                                                                   | Severity |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **ISS-02** | No correction path for a mistakenly recorded payment: no update, no delete, and payments are not audited (DEC-D05)                                                                                      | Medium   |
| **ISS-08** | No retention policy for NotificationLog, AuditEntry or soft-deleted records                                                                                                                             | Low      |
| **ISS-16** | MemorizationCoverage stores current state only. It cannot answer "what had this student memorized as of last month" — it can only be recomputed by replaying reports, which is possible but unspecified | Low      |
| **ISS-10** | "Restore" in Admin recovery is undefined; DEC-C02 forbids reviving a Membership, so recovery is read/export only                                                                                        | Low      |

---

## 21. Audit Requirements

### 21.1 Classification

Per DEC-D05, exactly three actions are audited. The classification below records what was decided **and** what was consciously left unaudited, so the gap is visible rather than accidental.

| Action                           | Classification     | Basis                                                                                             |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| Group enrollment toggled         | ✅ **Required**    | DEC-D05, BR-62                                                                                    |
| Group created                    | ✅ **Required**    | DEC-D05, BR-62                                                                                    |
| Login                            | ✅ **Required**    | DEC-D05, BR-62                                                                                    |
| Join request accepted            | ❌ **Not audited** | DEC-D05                                                                                           |
| Join request rejected            | ❌ **Not audited** | DEC-D05                                                                                           |
| Payment recorded                 | ❌ **Not audited** | DEC-D05                                                                                           |
| Student removed                  | ❌ **Not audited** | DEC-D05                                                                                           |
| Role promotion                   | ❌ **Not audited** | DEC-D05                                                                                           |
| Staff reassignment               | ❌ **Not audited** | DEC-D05                                                                                           |
| Group archived / un-archived     | ❌ **Not audited** | DEC-D05                                                                                           |
| Daily / weekly report submission | ⏳ **Not needed**  | Records are immutable and already carry `submitted_at` and actor — they are their own audit trail |
| Dashboard reads                  | ⏳ **Not needed**  | —                                                                                                 |
| Notification preference change   | ⏳ **Not needed**  | —                                                                                                 |

### 21.2 Audit entry content (FR-AUDIT-02)

| Field                         | Content                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `actor_id`                    | The authenticated user who performed the action                                                              |
| `action`                      | `ENROLLMENT_TOGGLED` / `GROUP_CREATED` / `LOGIN`                                                             |
| `target_type`, `target_id`    | The affected resource, where applicable                                                                      |
| `previous_value`, `new_value` | For `ENROLLMENT_TOGGLED`: `Open`/`Closed`. For `GROUP_CREATED`: the created configuration. For `LOGIN`: none |
| `occurred_at`                 | UTC timestamp                                                                                                |

### 21.3 Partial mitigation through inherent traceability

Several unaudited actions leave a usable trace as a by-product of the data model, which softens — but does not close — the gap:

| Unaudited action       | Inherent trace                                                   |
| ---------------------- | ---------------------------------------------------------------- |
| Join accepted/rejected | `JoinRequest.reviewed_by` + `reviewed_at` + `resolution_source`  |
| Payment recorded       | `PaymentRecord.recorded_by` + `paid_at`                          |
| Student removed        | `Membership.ended_by` + `ended_at`                               |
| Group archived         | `Group.archived_at` (actor not captured)                         |
| Role promotion         | **No trace at all** — `User.role` is overwritten in place        |
| Staff reassignment     | **No trace at all** — `Group.teacher_id` is overwritten in place |

⚠️ **RISK-08 (Medium, NEW)** — Payment recording and membership termination are the system's two highest-consequence actions and are not audited (DEC-D05). Both leave a _current-state_ trace (`recorded_by`, `ended_by`) but no _history_: a payment recorded in error and then… there is no "and then", because no correction path exists (ISS-02). Role promotion and staff reassignment leave no trace whatsoever.

💡 **RECOMMENDATION** — if the audit scope is ever revisited, the highest-value additions in order are: payment recorded, student removed, role promotion. This is recorded as a future consideration (§32) and is **not** applied, since DEC-D05 was explicit.

---

## 22. Notification Requirements

Notifications are **in the MVP** (DEC-C10), superseding SRS §2.2 and DEC-024. This directly mitigates RISK-02, which identified the absence of reminders as working against the 80% submission target.

### 22.1 Structure

Each notification is specified as four separable things, per the required analysis structure:

| Layer                    | Definition                                              |
| ------------------------ | ------------------------------------------------------- |
| **Business event**       | Something that happened in the domain                   |
| **Notification trigger** | The condition under which that event produces a message |
| **Recipient**            | Who receives it, resolved from the domain               |
| **Channel**              | Push only (DEC-D04)                                     |

### 22.2 Event catalogue (DEC-D03)

| ID       | Business event                 | Trigger                                                   | Recipient                     | Mutable?                |
| -------- | ------------------------------ | --------------------------------------------------------- | ----------------------------- | ----------------------- |
| **N-01** | Daily report not yet submitted | 20:00 in the student's local timezone, on an expected day | Student                       | ✅ Yes                  |
| **N-02** | Weekly report available        | Start of the group's recitation day, student-local        | Student                       | ✅ Yes                  |
| **N-03** | Join request accepted          | Assistant accepts (UC-04)                                 | Applicant                     | ❌ **Account-critical** |
| **N-04** | Join request rejected          | Assistant rejects, or auto-rejection on archival (UC-13)  | Applicant                     | ❌ **Account-critical** |
| **N-05** | New join request received      | Request submitted (UC-03)                                 | Assistant of the target group | ✅ Yes                  |
| **N-06** | Payment due soon               | Cycle enters its final 10 days (BR-33)                    | Student                       | ✅ Yes                  |
| **N-07** | Student at risk                | Student meets the AtRisk predicate (§18.4)                | Teacher of that group         | ✅ Yes                  |
| **N-08** | Removed from group             | Admin removes the student (UC-12)                         | Student                       | ❌ **Account-critical** |

### 22.3 Suppression rules (FR-NOTIF-03)

N-01 is suppressed when any of the following holds:

- A Daily Report already exists for the student's local today
- Today is the group's recitation day
- The group's `lifecycle_state` is `Archived`
- The Membership is not `Active`
- The student has muted the category
- No valid device token exists

💡 N-06 should be sent **once** per cycle, not daily for ten days. N-07 should be sent **once** per at-risk episode, not daily while the condition persists. Neither is specified in the source; recorded as **ISS-17** (Low).

### 22.4 Payload constraint (BR-46, FR-NOTIF-07)

A push payload carries an event type and a resource identifier only. It contains **no** name, phone number, report content, score, metric or payment amount. Push payloads render on locked screens and traverse a third party (EXT-03), and NFR-10 restricts exactly this data.

### 22.5 Delivery semantics

| Property           | Specification                                                                      |
| ------------------ | ---------------------------------------------------------------------------------- |
| Guarantee          | **Best effort.** No business outcome depends on delivery (BR-60)                   |
| Non-delivery       | Never excuses a missed report — BR-21 and BR-23 are unaffected                     |
| Retry              | 💡 At most one retry on transient transport failure; never on invalid-token errors |
| Token invalidation | Transport-reported invalid tokens are marked `invalidated_at` (E-09)               |
| Observability      | Dispatch outcome recorded per notification (FR-NOTIF-08)                           |
| Ordering           | Not guaranteed and not required                                                    |

### 22.6 Scope boundaries

| Item                                                                  | Status                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Push notifications                                                    | ✅ IN MVP (DEC-C10)                                                                              |
| Email notifications                                                   | ⏳ OUT OF SCOPE (DEC-D04) — except the password reset in FR-AUTH-04, which is not a notification |
| SMS / WhatsApp messages                                               | ⏳ OUT OF SCOPE                                                                                  |
| In-app notification centre / history                                  | ⏳ OUT OF SCOPE — not requested                                                                  |
| Notification for report submitted, weekly finalised, payment recorded | ⏳ OUT OF SCOPE — not in the DEC-D03 catalogue                                                   |

---

## 23. API Requirements

This section derives the **API surface**, not its implementation. Protocol style (REST vs GraphQL), versioning and transport framing are architecture decisions and are deliberately left open.

Conventions used below: `403` denotes both "not permitted" and "outside scope" (NFR-20); `409` denotes a state conflict; `422` denotes validation failure.

### API-01 — Authentication

| Method | Path                           | Purpose                     | Actor     | Authorization | Request                                 | Response                         | Validation          | Errors                              |
| ------ | ------------------------------ | --------------------------- | --------- | ------------- | --------------------------------------- | -------------------------------- | ------------------- | ----------------------------------- |
| POST   | `/auth/register`               | Self-register               | Anonymous | None          | email, password, timezone, device token | session, role                    | VR-01, VR-02, VR-28 | 409 email taken, 422                |
| POST   | `/auth/login`                  | Authenticate                | Anonymous | None          | email, password, timezone, device token | session, role, dashboard route   | —                   | 401                                 |
| POST   | `/auth/logout`                 | End session                 | Any       | Authenticated | device token                            | —                                | —                   | 401                                 |
| POST   | `/auth/password-reset/request` | Request reset               | Anonymous | None          | email                                   | accepted                         | —                   | Always 202, never reveals existence |
| POST   | `/auth/password-reset/confirm` | Complete reset              | Anonymous | Valid token   | token, new password                     | —                                | VR-02               | 400 invalid/expired                 |
| GET    | `/me`                          | Own profile and role        | Any       | Authenticated | —                                       | id, role, name, gender, timezone | —                   | 401                                 |
| PATCH  | `/me`                          | Update own timezone / prefs | Any       | Authenticated | timezone, preferences                   | updated                          | VR-28, VR-38        | 422                                 |

Side effects: `/auth/login` and `/auth/register` write an `AuditEntry` (`LOGIN`) and refresh `User.timezone` (FR-AUTH-07).

### API-02 — Groups

| Method | Path                        | Purpose                                 | Actor                         | Authorization                                 |
| ------ | --------------------------- | --------------------------------------- | ----------------------------- | --------------------------------------------- |
| GET    | `/groups`                   | List groups **in caller scope** (§14.1) | Any                           | Scope-filtered                                |
| GET    | `/groups/available?gender=` | Open + Active + gender-matching groups  | User                          | `role = User`                                 |
| GET    | `/groups/{id}`              | Group detail                            | Admin, assigned staff, member | Scope                                         |
| POST   | `/groups`                   | Create group                            | Admin                         | Admin only                                    |
| PATCH  | `/groups/{id}`              | Update name                             | Admin                         | Admin only                                    |
| PATCH  | `/groups/{id}/enrollment`   | Toggle `Open`/`Closed`                  | Teacher                       | Assigned Teacher only                         |
| PATCH  | `/groups/{id}/staff`        | Reassign Teacher/Assistant              | Admin                         | Admin only                                    |
| PATCH  | `/groups/{id}/lifecycle`    | Archive / un-archive                    | Admin                         | Admin only                                    |
| DELETE | `/groups/{id}`              | Delete group                            | Admin                         | Admin, and only if no Membership ever existed |

Key validations: VR-23, VR-24, VR-25 on create; VR-31 on staff change; VR-30 on delete.
Errors: `403` unassigned Teacher toggling (AC-17); `409` deleting a group with history (BR-43); `422` staff role mismatch.
Side effects: create → `AuditEntry(GROUP_CREATED)`; enrollment toggle → `AuditEntry(ENROLLMENT_TOGGLED)`; archive → auto-reject pending requests (FR-REQ-08) + N-04.

### API-03 — Join Requests

| Method | Path                            | Purpose                                   | Actor            | Authorization                                   |
| ------ | ------------------------------- | ----------------------------------------- | ---------------- | ----------------------------------------------- |
| POST   | `/join-requests`                | Submit application                        | User             | `role = User`, no Pending, no Active Membership |
| GET    | `/join-requests/mine`           | Own request **status only** while pending | User             | Own only (DEC-C09)                              |
| GET    | `/join-requests?status=pending` | Queue for assigned groups, sorted         | Assistant        | Assigned groups only                            |
| GET    | `/join-requests/{id}`           | Full applicant profile                    | Assistant, Admin | Assigned group or Admin                         |
| POST   | `/join-requests/{id}/accept`    | Accept                                    | Assistant        | Assigned group                                  |
| POST   | `/join-requests/{id}/reject`    | Reject                                    | Assistant        | Assigned group                                  |

Request body for POST: full profile + `memorized_ahzab` (set, size 5–60) + `fee_agreement` + `program_goal`.
Response for the Assistant queue: applicant name, score, submission time, sorted by score desc then `created_at` asc (FR-REQ-02a).
Validation: VR-03…VR-09, VR-04a, VR-34.
Errors: `409` already has a Pending request or an Active Membership; `409` group closed/archived since load; `422` fewer than 5 ahzab, goal ≠ Memorization, fee not agreed, gender mismatch.
Side effects of accept: role change, `full_name`/`gender` copy, Membership creation, Coverage seeding, N-03.

### API-04 — Memberships

| Method | Path                       | Purpose                    | Actor                     | Authorization  |
| ------ | -------------------------- | -------------------------- | ------------------------- | -------------- |
| GET    | `/memberships/mine`        | Own active membership      | Student                   | Own            |
| GET    | `/groups/{id}/memberships` | Roster                     | Teacher, Assistant, Admin | Assigned group |
| DELETE | `/memberships/{id}`        | Terminate (remove student) | Admin                     | Admin only     |

`DELETE` is a **soft** operation: state → `Terminated`, cascade soft-delete, role revert, N-08. Errors: `403` self-removal (FR-ADMIN-02); `409` already terminated.

### API-05 — Daily Reports

| Method | Path                                        | Purpose                                             | Actor          | Authorization                      |
| ------ | ------------------------------------------- | --------------------------------------------------- | -------------- | ---------------------------------- |
| GET    | `/daily-reports/today`                      | Today's report, or the reason submission is blocked | Student        | Own                                |
| POST   | `/daily-reports`                            | Submit today's report                               | Student        | Own Active Membership              |
| GET    | `/daily-reports?from=&to=`                  | Own history, paginated                              | Student        | Own                                |
| GET    | `/memberships/{id}/daily-reports?from=&to=` | Raw report list                                     | Teacher, Admin | Assigned group. **Assistant: 403** |

`GET /daily-reports/today` must return the _blocking reason_ — already submitted, recitation day, group archived — so the client can render the correct state without inferring it.
Validation: VR-10…VR-20, VR-14a, VR-35.
Errors: `409` duplicate for the date (AC-07); `422` recitation day (AC-10), backdated (AC-08), invalid ayah, time-window violation.
Side effects: coverage update (FR-DR-12), reminder suppression.
⚠️ Pagination parameters are unspecified in the source — **ISS-18** (Low).

### API-06 — Weekly Reports

| Method | Path                               | Purpose                                  | Actor          | Authorization                      |
| ------ | ---------------------------------- | ---------------------------------------- | -------------- | ---------------------------------- |
| GET    | `/weekly-reports/current`          | This week's report with computed metrics | Student        | Own                                |
| POST   | `/weekly-reports/{id}/confirm`     | Confirm attendance and finalise          | Student        | Own, recitation day only           |
| GET    | `/weekly-reports?from=&to=`        | Own history                              | Student        | Own                                |
| GET    | `/memberships/{id}/weekly-reports` | Weekly history                           | Teacher, Admin | Assigned group. **Assistant: 403** |

Validation: VR-21, VR-22, VR-36. Errors: `422` not the recitation day; `409` already finalised.

### API-07 — Performance

| Method | Path                                    | Purpose                             | Actor                         | Authorization         |
| ------ | --------------------------------------- | ----------------------------------- | ----------------------------- | --------------------- |
| GET    | `/me/performance?period=`               | Own commitment, progress, breakdown | Student                       | Own                   |
| GET    | `/groups/{id}/performance?period=`      | Group dashboard (§9.4.2)            | Teacher, Admin                | Assigned group        |
| GET    | `/memberships/{id}/performance?period=` | Individual dashboard (§9.4.1)       | Teacher, Student (own), Admin | Assigned group or own |
| GET    | `/groups/{id}/at-risk`                  | At-risk list                        | Teacher, Admin                | Assigned group        |

`period` accepts `week` \| `month` \| `3months` \| `custom&from=&to=` (FR-PERF-03).
Every rate in the response must be **nullable** so that "not enough data" is distinguishable from zero (DEC-B04) — a plain numeric type would silently collapse the two.
**Assistant receives `403` on every endpoint in this group** (DEC-B09).

### API-08 — Payments

| Method | Path                            | Purpose                                             | Actor            | Authorization                    |
| ------ | ------------------------------- | --------------------------------------------------- | ---------------- | -------------------------------- |
| GET    | `/me/payments`                  | Own derived cycle ledger, status, next due, arrears | Student          | Own                              |
| GET    | `/groups/{id}/payments?status=` | Ledger for a group, filterable                      | Assistant, Admin | Assigned group. **Teacher: 403** |
| POST   | `/memberships/{id}/payments`    | Record a cycle as paid                              | Assistant        | Assigned group                   |

Request body: `cycle_index`. Response: full derived ledger (§18.5) — cycles are computed, never read from storage.
Validation: VR-26, VR-27, VR-37. Errors: `409` cycle already paid; `422` future cycle; `403` wrong group.
⚠️ No endpoint exists to correct a payment (ISS-02).

### API-09 — Progress

| Method | Path                         | Purpose                                                    | Actor             |
| ------ | ---------------------------- | ---------------------------------------------------------- | ----------------- |
| GET    | `/me/progress`               | Own `ahzab_completed`, coverage, `last_memorized_position` | Student           |
| GET    | `/memberships/{id}/progress` | Same, for a student                                        | Teacher, Admin    |
| GET    | `/quran/surahs`              | Reference data for form pickers and validation             | Any authenticated |
| GET    | `/quran/hizb-boundaries`     | Hizb boundaries                                            | Any authenticated |

Reference endpoints are static and heavily cacheable; they should carry long cache headers or be bundled into the client.

### API-10 — Administration

| Method | Path                         | Purpose                          | Actor |
| ------ | ---------------------------- | -------------------------------- | ----- |
| PATCH  | `/users/{id}/role`           | Promote User → Teacher/Assistant | Admin |
| GET    | `/users?role=`               | List users for assignment        | Admin |
| GET    | `/memberships/{id}/recovery` | View soft-deleted records        | Admin |
| GET    | `/audit?action=&from=&to=`   | Audit log                        | Admin |

Errors: `422` source role is not `User` (BR-R03); `403` self-demotion (FR-ADMIN-02); `409` demotion blocked by active assignment (VR-31).

### API-11 — Notifications

| Method | Path                           | Purpose                        | Actor |
| ------ | ------------------------------ | ------------------------------ | ----- |
| POST   | `/devices`                     | Register a push token          | Any   |
| DELETE | `/devices/{id}`                | Unregister                     | Any   |
| GET    | `/me/notification-preferences` | List categories and mute state | Any   |
| PATCH  | `/me/notification-preferences` | Mute/unmute a category         | Any   |

Errors: `422` attempt to mute an account-critical category (VR-38).

### 23.1 Cross-cutting API requirements

| ID          | Requirement                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API-X01** | Every endpoint enforces authorisation server-side (NFR-08).                                                                                              |
| **API-X02** | Every endpoint applies the caller's scope filter (§14) in the data layer (NFR-19).                                                                       |
| **API-X03** | Out-of-scope and non-existent resources return the same status (NFR-20).                                                                                 |
| **API-X04** | Every list endpoint returning an unbounded collection is paginated ⚠️ ISS-18.                                                                            |
| **API-X05** | Write endpoints that create uniquely-constrained rows rely on the database constraint for conflict detection, not a preceding read (UC-03 E2, UC-05 E4). |
| **API-X06** | Error messages are returned in Arabic for user-facing validation failures (NFR-03).                                                                      |
| **API-X07** | Responses expose nullable rates rather than substituting 0 (DEC-B04).                                                                                    |

⏳ Protocol style, versioning scheme, authentication token format and rate limiting are **architecture decisions**, not analysis outputs. They are listed in §26 and §30.

---

## 24. Data Requirements

### 24.1 Conceptual data model

Presented per entity as: identifier, required attributes, optional attributes, relationships, unique constraints, business constraints, historical requirements. The relational proposal follows in §24.5 and is kept deliberately separate.

**User (E-01)**

| Aspect               | Detail                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Identifier           | `id` (UUID)                                                                                             |
| Required             | `email`, `password_hash`, `role`, `timezone`, `created_at`                                              |
| Optional             | `full_name`, `gender` (populated on first acceptance)                                                   |
| Relationships        | 0..N JoinRequest, 0..N Membership, 0..N Group (as teacher), 0..N Group (as assistant), 0..N DeviceToken |
| Unique               | `email`                                                                                                 |
| Business constraints | Exactly one row with `role = Admin`; `role` ∈ enum; timezone valid IANA                                 |
| Historical           | Never deleted. Role changes are **not** historised (⚠️ RISK-08)                                         |

**Group (E-02)**

| Aspect               | Detail                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identifier           | `id`                                                                                                                                                                    |
| Required             | `name`, `gender`, `recitation_day`, `enrollment_status`, `lifecycle_state`, `teacher_id`, `assistant_id`, `created_by`, `created_at`                                    |
| Optional             | `archived_at`                                                                                                                                                           |
| Unique               | 💡 `name` — not stated in the SRS, recommended                                                                                                                          |
| Business constraints | `teacher_id` must reference `role = Teacher`; `assistant_id` must reference `role = Assistant`; `recitation_day` immutable; deletion forbidden once a Membership exists |
| Historical           | Archived rather than deleted                                                                                                                                            |

**Membership (E-03)**

| Aspect               | Detail                                                                   |
| -------------------- | ------------------------------------------------------------------------ |
| Identifier           | `id`                                                                     |
| Required             | `user_id`, `group_id`, `join_request_id`, `state`, `started_at`          |
| Optional             | `ended_at`, `ended_by`                                                   |
| Unique               | **Partial**: at most one row per `user_id` where `state = Active`        |
| Business constraints | Group gender must equal user gender at creation; `ended_at ≥ started_at` |
| Historical           | Full — this entity **is** the enrollment history                         |

**JoinRequest (E-04)**

| Aspect               | Detail                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------- |
| Identifier           | `id`                                                                                                              |
| Required             | `user_id`, `group_id`, profile fields, `memorized_ahzab`, `memorized_hizb_count`, `score`, `status`, `created_at` |
| Optional             | `reviewed_at`, `reviewed_by`, `resolution_source`, `deleted_at`                                                   |
| Unique               | **Partial**: at most one row per `user_id` where `status = Pending`                                               |
| Business constraints | `program_goal = Memorization`; `fee_agreement = true`; `gender` = group gender; `                                 | memorized_ahzab | `∈ 5..60;`score` immutable |
| Historical           | Full; unlimited rejected requests per user                                                                        |

**DailyReport (E-05)**

| Aspect               | Detail                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Identifier           | `id`                                                                                                |
| Required             | `membership_id`, `report_date`, `type`, `submitted_at`, `submitted_timezone` + type-specific fields |
| Optional             | `deleted_at`                                                                                        |
| Unique               | `(membership_id, report_date)`                                                                      |
| Business constraints | Immutable after insert; `report_date` = submission-day local date; not the group's recitation day   |
| Historical           | Append-only (NFR-17)                                                                                |

**WeeklyReport (E-06)**

| Aspect               | Detail                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Identifier           | `id`                                                                                                                |
| Required             | `membership_id`, `week_start`, `week_end`, `expected_days`, five metric counts, `attended_recitation_call`, `state` |
| Optional             | `finalised_at`, `finalised_by`, `deleted_at`                                                                        |
| Unique               | `(membership_id, week_start)`                                                                                       |
| Business constraints | Immutable once `Finalised`; metrics snapshotted at finalisation                                                     |
| Historical           | Append-only                                                                                                         |

**PaymentRecord (E-07)**

| Aspect               | Detail                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Identifier           | `id`                                                                                         |
| Required             | `membership_id`, `cycle_index`, `amount`, `paid_at`, `recorded_by`                           |
| Unique               | `(membership_id, cycle_index)`                                                               |
| Business constraints | `amount = 30`; `recorded_by` must be the assigned Assistant; `cycle_index` must have started |
| Historical           | Append-only; **no correction path** ⚠️ ISS-02                                                |

**MemorizationCoverage (E-08)**

| Aspect               | Detail                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| Identifier           | `id`                                                                   |
| Required             | `membership_id`, `intervals`, `ahzab_completed`, `updated_at`          |
| Optional             | `last_memorized_position`                                              |
| Unique               | `membership_id`                                                        |
| Business constraints | Intervals disjoint, non-adjacent, ordered; monotonically non-shrinking |
| Historical           | Current state only ⚠️ ISS-16                                           |

### 24.2 Reference data

| Entity              | Rows | Source      | Mutability                                  |
| ------------------- | ---- | ----------- | ------------------------------------------- |
| Surah (E-13)        | 114  | EXT-04 JSON | Read-only at runtime; replaced by migration |
| HizbBoundary (E-14) | 60   | EXT-04 JSON | Read-only at runtime                        |

💡 **RECOMMENDATION** — load reference data through a versioned deployment migration and record the dataset version in application metadata. If a dataset correction ever changes ayah counts, every stored ordinal becomes invalid; the version stamp is what makes that detectable.

### 24.3 Applicant profile fields (amended §9.2)

| Field                    | Type           | Required | Constraint                                                     | Change                                             |
| ------------------------ | -------------- | -------- | -------------------------------------------------------------- | -------------------------------------------------- |
| `full_name`              | String         | Yes      | 3–80 characters                                                | —                                                  |
| `gender`                 | Enum           | Yes      | Male / Female                                                  | —                                                  |
| `age`                    | Integer        | Yes      | Positive integer; **no range limit**                           | ❌ Amended (DEC-D06)                               |
| `phone_number`           | String         | Yes      | Tunisian format                                                | —                                                  |
| `occupation`             | String         | Yes      |                                                                | —                                                  |
| `city`                   | String         | Yes      |                                                                | —                                                  |
| `memorized_ahzab`        | Set\<Integer\> | Yes      | Distinct values 1–60, cardinality 5–60                         | ❌ **Replaces `previous_hizb`** (DEC-D01, DEC-D07) |
| `memorized_hizb_count`   | Integer        | Yes      | Derived = set cardinality; persisted for score reproducibility | ➕ New                                             |
| `tajweed_level`          | Enum           | Yes      | Beginner / Intermediate / Advanced                             | —                                                  |
| `studied_tajweed_theory` | Boolean        | Yes      |                                                                | —                                                  |
| `studied_qalun`          | Boolean        | Yes      |                                                                | —                                                  |
| `fee_agreement`          | Boolean        | Yes      | Must be `true`                                                 | —                                                  |
| `program_goal`           | Enum           | Yes      | Must be `Memorization`                                         | —                                                  |
| `score`                  | Decimal        | Yes      | Computed, immutable, range 9.17–100                            | ❌ Range corrected                                 |
| `status`                 | Enum           | Yes      | Pending / Accepted / Rejected                                  | —                                                  |
| `group_id`               | UUID           | Yes      | Selected at step 2                                             | —                                                  |

### 24.4 Data volume

⚠️ **DEC-C11** — no sizing target was specified. Growth characteristics are nevertheless derivable and must inform indexing:

| Table                | Growth                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| DailyReport          | **6 rows per student per week** — by far the fastest-growing table, and the one every dashboard scans |
| WeeklyReport         | 1 row per student per week                                                                            |
| PaymentRecord        | ≤1 row per student per quarter                                                                        |
| MemorizationCoverage | 1 row per membership; the interval set itself grows slowly and is bounded in practice                 |
| JoinRequest          | Unbounded per user in principle (no cooldown, BR-06) — a plausible abuse surface ⚠️ ISS-19            |
| NotificationLog      | ~1–2 rows per student per day                                                                         |
| AuditEntry           | Login-dominated                                                                                       |

The architecture must be correct at any scale (DEC-C11); the indexes in §24.6 are what make that true rather than aspirational.

### 24.5 Proposed relational model

Domain model and database implementation are separated deliberately; the following is the **proposal**, not a domain statement.

```
users(id PK, email UNIQUE, password_hash, role, full_name NULL,
      gender NULL, timezone, created_at)

groups(id PK, name, gender, recitation_day, enrollment_status,
       lifecycle_state, archived_at NULL,
       teacher_id FK→users, assistant_id FK→users,
       created_by FK→users, created_at)

memberships(id PK, user_id FK→users, group_id FK→groups,
            join_request_id FK→join_requests, state,
            started_at, ended_at NULL, ended_by FK→users NULL)

join_requests(id PK, user_id FK→users, group_id FK→groups,
              full_name, gender, age, phone_number, occupation, city,
              memorized_hizb_count, tajweed_level, studied_tajweed_theory,
              studied_qalun, fee_agreement, program_goal, score, status,
              resolution_source NULL, created_at, reviewed_at NULL,
              reviewed_by FK→users NULL, deleted_at NULL)

join_request_ahzab(join_request_id FK, hizb_number)      -- normalised set
      PRIMARY KEY (join_request_id, hizb_number)

daily_reports(id PK, membership_id FK→memberships, report_date, type,
              submitted_at, submitted_timezone,
              no_memorization_today NULL, memo_from_ordinal NULL,
              memo_to_ordinal NULL, memo_time_from NULL, memo_time_to NULL,
              completed_50_repetitions NULL, repetitions_in_single_session NULL,
              no_revision_today NULL, rev_from_ordinal NULL, rev_to_ordinal NULL,
              rev_time_from NULL, rev_time_to NULL, read_tafsir NULL,
              absence_reason NULL, deleted_at NULL)

weekly_reports(id PK, membership_id FK→memberships, week_start, week_end,
               expected_days, missed_daily_reports, missed_daily_memorization,
               missed_daily_revision, missed_50_repetitions,
               missed_single_session, attended_recitation_call, state,
               finalised_at NULL, finalised_by NULL, deleted_at NULL)

payment_records(id PK, membership_id FK→memberships, cycle_index, amount,
                paid_at, recorded_by FK→users, deleted_at NULL)

memorization_coverage(id PK, membership_id FK→memberships UNIQUE,
                      ahzab_completed, last_memorized_ordinal NULL, updated_at)

coverage_intervals(id PK, coverage_id FK→memorization_coverage,
                   start_ordinal, end_ordinal)

surahs(number PK, name_ar, ayah_count, ordinal_offset)
hizb_boundaries(hizb_number PK, start_ordinal, end_ordinal,
                start_surah, start_ayah, end_surah, end_ayah)

device_tokens(id PK, user_id FK→users, token, platform,
              registered_at, last_seen_at, invalidated_at NULL)
notification_preferences(id PK, user_id FK→users, category, muted)
notification_log(id PK, user_id FK→users, category, dispatched_at,
                 outcome, transport_reference NULL)
audit_entries(id PK, actor_id FK→users, action, target_type NULL,
              target_id NULL, previous_value NULL, new_value NULL, occurred_at)
```

💡 **Design notes.**

- Ayah positions are stored as **ordinals**, not `(surah, ayah)` pairs. Range containment, overlap and hizb-completion checks all become integer comparisons; the surah/ayah pair is reconstructed for display via `surahs`. Storing pairs would make every coverage query a two-column comparison with no benefit.
- `memorized_ahzab` is normalised into `join_request_ahzab` rather than stored as an array, so that "which applicants know hizb 30" remains queryable.
- `coverage_intervals` is a child table rather than a serialised blob, so interval containment can be evaluated in the database.

### 24.6 Required constraints and indexes

**Unique constraints (each guards a concurrency hazard that application logic cannot):**

| Constraint                                                             | Enforces               |
| ---------------------------------------------------------------------- | ---------------------- |
| `users(email)`                                                         | VR-01                  |
| `daily_reports(membership_id, report_date) WHERE deleted_at IS NULL`   | VR-11, AC-07, UC-05 E4 |
| `weekly_reports(membership_id, week_start) WHERE deleted_at IS NULL`   | VR-22                  |
| `payment_records(membership_id, cycle_index) WHERE deleted_at IS NULL` | VR-26                  |
| `memberships(user_id) WHERE state = 'Active'` — partial                | VR-32, BR-39           |
| `join_requests(user_id) WHERE status = 'Pending'` — partial            | VR-09, BR-01, UC-03 E2 |
| `memorization_coverage(membership_id)`                                 | R-12                   |

**Indexes required by the read paths in §18:**

| Index                                                         | Serves                                           |
| ------------------------------------------------------------- | ------------------------------------------------ |
| `daily_reports(membership_id, report_date)`                   | Every weekly and dashboard computation           |
| `weekly_reports(membership_id, week_start)`                   | AttendanceRate, weekly history                   |
| `memberships(group_id, state)`                                | Group roster and dashboards                      |
| `memberships(group_id, started_at, ended_at)`                 | Period-aware historical aggregation (FR-PERF-09) |
| `join_requests(group_id, status, score DESC, created_at ASC)` | FR-REQ-02 + FR-REQ-02a in one index              |
| `groups(gender, enrollment_status, lifecycle_state)`          | FR-JOIN-03 + FR-JOIN-03a                         |
| `coverage_intervals(coverage_id, start_ordinal)`              | Interval merge on insert                         |
| `payment_records(membership_id, cycle_index)`                 | Ledger derivation                                |

**Check constraints:** `weekly_reports.expected_days` ∈ 0..6 · `payment_records.amount = 30` · `daily_reports.memo_to_ordinal ≥ memo_from_ordinal` · `coverage_intervals.end_ordinal ≥ start_ordinal` · `memberships.ended_at ≥ started_at`.

**Referential integrity:** all foreign keys `ON DELETE RESTRICT`. Nothing in this model is ever physically deleted except `device_tokens`, so cascade behaviour must never be configured — a cascade would silently defeat DEC-B10.

---

## 25. Non-Functional Requirements

### 25.1 Platform

| ID     | Requirement                                                                | Target     |
| ------ | -------------------------------------------------------------------------- | ---------- |
| NFR-01 | Native or cross-platform mobile app for Android and iOS                    | ✅ Defined |
| NFR-02 | Requires an active internet connection; no offline mode, no local queueing | ✅ Defined |

### 25.2 Localisation

| ID     | Requirement                                                            | Target     |
| ------ | ---------------------------------------------------------------------- | ---------- |
| NFR-03 | Arabic only                                                            | ✅ Defined |
| NFR-04 | Full right-to-left layout on every screen, including charts and tables | ✅ Defined |
| NFR-05 | Surah names displayed in Arabic                                        | ✅ Defined |

### 25.3 Security

| ID         | Requirement                                                                                        | Target                                                   |
| ---------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| NFR-06     | Passwords stored hashed                                                                            | ✅ Defined; ⚠️ algorithm and provider undefined (ISS-05) |
| NFR-07     | All traffic over HTTPS                                                                             | ✅ Defined                                               |
| NFR-08     | Server-side authorisation on every endpoint                                                        | ✅ Defined                                               |
| NFR-09     | Teacher and Assistant data access scoped to assigned groups                                        | ✅ Defined                                               |
| NFR-10     | Personal data (phone, age, occupation, city) visible only to the reviewing Assistant and the Admin | ✅ Defined; ⚠️ email unaddressed (ISS-11)                |
| **NFR-19** | Scope filters applied in the data-access layer, not per controller                                 | 💡 NEW                                                   |
| **NFR-20** | Out-of-scope and non-existent resources are indistinguishable in responses                         | 💡 NEW                                                   |
| **NFR-21** | Session lifetime, refresh and revocation                                                           | ⚠️ **NFR target undefined**                              |
| **NFR-22** | Rate limiting on registration, login, password reset and join submission                           | ⚠️ **NFR target undefined** (relates to ISS-19)          |

### 25.4 Performance

| ID         | Requirement                                                                             | Target                                                                |
| ---------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| NFR-11     | Dashboard render under 3 seconds on 3G                                                  | ✅ Defined                                                            |
| NFR-12     | Weekly report computation under 2 seconds                                               | ✅ Defined                                                            |
| NFR-13     | Support the center's population with headroom                                           | ⚠️ **Target undefined by decision** (DEC-C11)                         |
| **NFR-23** | Coverage update on report submission must not perceptibly delay the submission response | 💡 NEW — the submission path is the one flow governing the 80% metric |

**Consequence of DEC-C11.** Without a sizing target, NFR-11 and NFR-12 cannot be validated by load test against a known population. The architecture must therefore be correct by construction: every metric read must be bounded by index-supported range scans over `(membership_id, date)` rather than by full scans that merely _happen_ to be fast at current volume. This is the practical justification for the index set in §24.6.

### 25.5 Usability

| ID         | Requirement                                                                              | Target                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| NFR-14     | Daily report submission completable in under 60 seconds                                  | ✅ Defined — **this is the single most consequential NFR**; it directly determines whether the 80% target is achievable |
| NFR-15     | Charts readable on a phone screen without zooming                                        | ✅ Defined                                                                                                              |
| **NFR-18** | Dashboards must indicate that all figures are self-declared                              | 💡 NEW — RISK-03 mitigation                                                                                             |
| **NFR-24** | The ahzab selection step (FR-JOIN-04a) must not materially lengthen the application flow | 💡 NEW — a 60-item selector is a real usability risk                                                                    |

### 25.6 Data

| ID         | Requirement                                                                                 | Target                          |
| ---------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| NFR-16     | Timestamps in UTC; day boundaries evaluated in the student's persisted timezone             | ✅ Defined (amended by DEC-B03) |
| NFR-17     | Daily and weekly report records append-only                                                 | ✅ Defined                      |
| **NFR-25** | Soft-deleted records excluded from every query except the two documented exceptions (§20.2) | 💡 NEW                          |

### 25.7 Availability, reliability, scalability

| ID         | Category                                       | Target                                                                                                       |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **NFR-26** | Availability / uptime                          | ⚠️ **NFR target undefined**                                                                                  |
| **NFR-27** | Backup frequency and recovery point objective  | ⚠️ **NFR target undefined** — material, since DEC-B10 makes the database the center's only historical record |
| **NFR-28** | Scheduler reliability and missed-run detection | ⚠️ **NFR target undefined** (ISS-01)                                                                         |
| **NFR-29** | Horizontal scalability                         | ⚠️ Undefined; DEC-C11 removes the basis for a target                                                         |

### 25.8 Accessibility

| ID         | Target                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **NFR-30** | ⚠️ **Undefined.** The SRS specifies RTL and readable charts but no accessibility standard (contrast, font scaling, screen readers) |

### 25.9 Maintainability

| ID         | Target                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NFR-31** | ⚠️ Undefined. 💡 Given that the entire product value rests on §18, the weekly and commitment calculations should be implemented as a pure, independently testable module with no I/O |

### 25.10 Observability

| ID         | Target                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NFR-32** | ⚠️ **Undefined.** 💡 Minimum viable set: scheduler run success/failure per job, notification dispatch outcome (FR-NOTIF-08), report submission rate against the 80% acceptance metric, and authorisation-failure rate |

### 25.11 Privacy

| ID         | Target                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-10     | ✅ Field-level restriction defined                                                                                                                                                            |
| **NFR-33** | ⚠️ Data retention and erasure policy **undefined** (ISS-08). DEC-B10 retains personal data indefinitely after a student leaves, which is a policy decision the center should make consciously |

### 25.12 NFR summary

| Status                                | Count |
| ------------------------------------- | ----- |
| ✅ Defined with a testable target     | 12    |
| 💡 Newly recommended, target proposed | 9     |
| ⚠️ Target undefined                   | 11    |

---

## 26. Architectural Requirements

Technologies are **not** selected here. This section derives what the architecture must provide, classified by necessity.

### 26.1 Required

| ID        | Requirement                                                                                                                                                | Driven by                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **AR-01** | Credential-based authentication with session management and email-based password reset                                                                     | FR-AUTH-01…04                                      |
| **AR-02** | Server-enforced role-based authorization with **instance-level scoping**                                                                                   | NFR-08, NFR-09, §14                                |
| **AR-03** | Persistent transactional storage with enforced unique and check constraints                                                                                | §24.6 — five constraints guard concurrency hazards |
| **AR-04** | ACID transactions spanning multi-entity operations: join acceptance (role + membership + coverage) and student removal (membership + four cascades + role) | UC-04, UC-12                                       |
| **AR-05** | A scheduled-job facility supporting **per-timezone execution**                                                                                             | FR-WR-06, FR-NOTIF-02, DEC-B03                     |
| **AR-06** | Append-only enforcement for reports at the storage layer                                                                                                   | NFR-17, BR-22                                      |
| **AR-07** | Soft-delete-aware data access applied by default                                                                                                           | DEC-B10, NFR-25                                    |
| **AR-08** | Interval-set computation and storage for memorization coverage                                                                                             | §17.6, ADR-008                                     |
| **AR-09** | Push notification dispatch with token lifecycle management                                                                                                 | DEC-C10, §22                                       |
| **AR-10** | Reference data loading and versioning for the Quran dataset                                                                                                | DEC-C01, §24.2                                     |
| **AR-11** | Mobile client for Android and iOS with full RTL support                                                                                                    | NFR-01, NFR-04                                     |
| **AR-12** | Timezone-aware date derivation from a persisted per-user identifier                                                                                        | DEC-B03, §19                                       |
| **AR-13** | A pure, side-effect-free computation module for §18                                                                                                        | NFR-31 💡                                          |

### 26.2 Recommended

| ID        | Requirement                                                                 | Rationale                                              |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| **AR-14** | Read-side caching for dashboard aggregates, keyed by `(membership, period)` | NFR-11 with an undefined population (DEC-C11)          |
| **AR-15** | A reconciliation job for memorization coverage                              | UC-05 E5 — coverage is derivable, so it is repairable  |
| **AR-16** | Structured logging and metrics for the observability set in §25.10          | NFR-32                                                 |
| **AR-17** | Idempotency on scheduled jobs                                               | §19.6 — double runs must not rewrite finalised reports |
| **AR-18** | Environment-configurable center timezone as the fallback for VR-28          | UC-01 5a                                               |

### 26.3 Optional

| ID        | Requirement                                                                       |
| --------- | --------------------------------------------------------------------------------- |
| **AR-19** | Read replicas for dashboard queries — unjustifiable without a sizing target       |
| **AR-20** | Materialised aggregate tables — premature; §24.6 indexes should be measured first |
| **AR-21** | Feature flags                                                                     |

### 26.4 Architectural implications of the analysis

| Finding                                                                            | Implication                                                                                                                              |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Everything of value is **derived** (§8.3): scores, statuses, cycles, at-risk flags | The system is read-heavy and computation-heavy relative to its write volume. Optimisation effort belongs on the read path                |
| Reports are immutable and non-backdatable                                          | Finalised aggregates can be safely snapshotted and never invalidated — an unusually strong caching guarantee (ADR-003)                   |
| Day boundaries are per-user                                                        | Every date-derived operation needs the user's timezone. It must be available on the hot path without a join, i.e. carried in the session |
| Coverage is a fold over all history                                                | It must be materialised (AR-08); computing it per render does not scale at any population                                                |
| Soft delete has two period-aware exceptions                                        | Filtering cannot be a blanket global scope; it must be period-aware for FR-PERF-09                                                       |
| Five uniqueness rules are concurrency hazards                                      | They must be database constraints (AR-03); application-level checks would be wrong under concurrent submission                           |
| No population estimate exists                                                      | The architecture must be scale-agnostic. Indexes and bounded queries substitute for capacity planning                                    |

---

## 27. Requirements Traceability Matrix

### 27.1 Traceability chain

```
Business problem (SRS §1.2)
      ↓
Functional requirement (FR-*)
      ↓
Use case (UC-*)
      ↓
Business rule (BR-*) + Validation rule (VR-*)
      ↓
Entity / system behaviour (E-*, ST-*, §18)
      ↓
API endpoint (API-*)
      ↓
Test case (TC-*, seeded from AC-*)
```

### 27.2 Pain point coverage

| Pain point                                                    | Addressed by                                                         | Requirements                             | Verified by              |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- | ------------------------ |
| **#1** Teachers lose track of what each student has memorized | Daily Reports, Weekly Reports, coverage engine, individual dashboard | FR-DR-_, FR-WR-_, FR-PROG-\*, FR-PERF-02 | AC-11, AC-15, TC-020…024 |
| **#2** Students drop off silently                             | Commitment Score, at-risk list, daily reminder                       | FR-PERF-01/08, FR-NOTIF-01/02            | AC-15, TC-025, TC-041    |
| **#3** Fee collection untracked                               | Payment ledger, arrears, `Due Soon`                                  | FR-PAY-\*                                | AC-18, AC-19, TC-030…033 |

### 27.3 Matrix

| Requirement          | Use case     | Rule(s)                | Entity                     | API                                                   | Test                  |
| -------------------- | ------------ | ---------------------- | -------------------------- | ----------------------------------------------------- | --------------------- |
| FR-AUTH-01           | UC-01        | BR-R02                 | User                       | `POST /auth/register`                                 | TC-001 (AC-02)        |
| FR-AUTH-02           | UC-01        | BR-R02                 | User                       | `POST /auth/register`                                 | TC-002                |
| FR-AUTH-03           | UC-01        | —                      | User                       | `POST /auth/login`                                    | TC-003                |
| FR-AUTH-04           | UC-01        | —                      | User                       | `POST /auth/password-reset/*`                         | TC-004                |
| FR-AUTH-05           | UC-02        | BR-R01                 | User                       | `GET /me`                                             | TC-005                |
| FR-AUTH-06           | UC-01        | BR-R05                 | User                       | `POST /auth/login`                                    | TC-006 (AC-01)        |
| FR-AUTH-07           | UC-01, UC-02 | T-01, T-02             | User                       | `POST /auth/login`, `PATCH /me`                       | TC-007                |
| FR-AUTH-08           | UC-01        | —                      | DeviceToken                | `POST /devices`                                       | TC-008                |
| FR-JOIN-01…04        | UC-03        | BR-36, BR-37           | JoinRequest                | `POST /join-requests`                                 | TC-009                |
| FR-JOIN-03, 03a      | UC-03        | BR-08, BR-41           | Group                      | `GET /groups/available`                               | TC-010 (AC-03)        |
| FR-JOIN-04a          | UC-03        | BR-57                  | JoinRequest                | `POST /join-requests`                                 | TC-011                |
| FR-JOIN-05           | UC-03        | BR-36                  | JoinRequest                | `POST /join-requests`                                 | TC-012 (AC-04)        |
| FR-JOIN-06           | UC-03        | BR-37                  | JoinRequest                | `POST /join-requests`                                 | TC-013                |
| FR-JOIN-07           | UC-03        | BR-38, BR-59           | JoinRequest                | `POST /join-requests`                                 | TC-014                |
| FR-JOIN-09, 10       | UC-03        | BR-01, BR-03           | JoinRequest, Membership    | `POST /join-requests`                                 | TC-015                |
| FR-JOIN-11, 11a      | UC-02, UC-03 | —                      | JoinRequest                | `GET /join-requests/mine`                             | TC-016                |
| FR-JOIN-12           | UC-03        | —                      | JoinRequest                | — (absence of endpoint)                               | TC-017                |
| FR-REQ-01            | UC-04        | NFR-09                 | JoinRequest                | `GET /join-requests`                                  | TC-018                |
| FR-REQ-02, 02a       | UC-04        | BR-59                  | JoinRequest                | `GET /join-requests`                                  | TC-019 (AC-05)        |
| FR-REQ-05, 05a, 05b  | UC-04        | BR-02, BR-32, BR-53    | Membership, User, Coverage | `POST /join-requests/{id}/accept`                     | TC-020 (AC-06)        |
| FR-REQ-06, 07        | UC-04        | BR-06                  | JoinRequest                | `POST /join-requests/{id}/reject`                     | TC-021                |
| FR-REQ-08, 09        | UC-13, UC-14 | BR-42                  | JoinRequest                | `PATCH /groups/{id}/lifecycle`                        | TC-022                |
| FR-GRP-01…04         | UC-10        | BR-07, BR-11, BR-12    | Group                      | `POST /groups`                                        | TC-023 (AC-01)        |
| FR-GRP-05            | UC-14        | BR-10, BR-62           | Group, AuditEntry          | `PATCH /groups/{id}/enrollment`                       | TC-024                |
| FR-GRP-07, 08, 08a   | UC-12        | BR-04, BR-05a          | Membership                 | `DELETE /memberships/{id}`                            | TC-025 (AC-20, AC-21) |
| FR-GRP-09, 10        | UC-11        | BR-44                  | Group, User                | `PATCH /groups/{id}/staff`                            | TC-026                |
| FR-GRP-11, 12        | UC-13        | BR-41, BR-42, BR-43    | Group                      | `PATCH /groups/{id}/lifecycle`                        | TC-027                |
| FR-DR-01             | UC-05        | BR-19                  | DailyReport                | `POST /daily-reports`                                 | TC-028 (AC-07)        |
| FR-DR-02, 03         | UC-05        | BR-20, BR-21, T-01     | DailyReport                | `POST /daily-reports`                                 | TC-029 (AC-08)        |
| FR-DR-04             | UC-05        | BR-22                  | DailyReport                | — (absence of endpoint)                               | TC-030 (AC-09)        |
| FR-DR-05…09          | UC-05        | BR-47, BR-48           | DailyReport                | `POST /daily-reports`                                 | TC-031                |
| FR-DR-06             | UC-05        | BR-16                  | DailyReport                | `POST /daily-reports`                                 | TC-032 (AC-10)        |
| FR-DR-10             | UC-08        | —                      | DailyReport                | `GET /daily-reports`                                  | TC-033                |
| FR-DR-11             | UC-05, UC-13 | BR-42                  | DailyReport                | `POST /daily-reports`                                 | TC-034                |
| FR-DR-12             | UC-05        | BR-51, BR-53           | Coverage                   | `POST /daily-reports`                                 | TC-035                |
| FR-WR-01…03          | UC-06        | BR-45, §18.2           | WeeklyReport               | `GET /weekly-reports/current`                         | TC-036 (AC-11)        |
| FR-WR-04, 05         | UC-06        | BR-30                  | WeeklyReport               | `POST /weekly-reports/{id}/confirm`                   | TC-037                |
| FR-WR-06             | UC-06        | T-01, §19.4            | WeeklyReport               | (Scheduler)                                           | TC-038 (AC-12)        |
| FR-WR-07             | UC-06        | BR-22                  | WeeklyReport               | `POST .../confirm`                                    | TC-039                |
| FR-WR-08             | UC-06        | DEC-A07                | WeeklyReport               | `GET /weekly-reports/current`                         | TC-040                |
| FR-WR-09, 10         | UC-06        | §18.1                  | WeeklyReport               | `GET /weekly-reports/current`                         | TC-041                |
| FR-PERF-01, 03       | UC-07        | §18.3                  | —                          | `GET /groups/{id}/performance`                        | TC-042 (AC-16)        |
| FR-PERF-02           | UC-08        | §18.3                  | —                          | `GET /memberships/{id}/performance`                   | TC-043                |
| FR-PERF-04           | UC-08        | —                      | DailyReport                | `GET /memberships/{id}/daily-reports`                 | TC-044                |
| FR-PERF-05           | UC-02        | §18.3                  | —                          | `GET /me/performance`                                 | TC-045                |
| FR-PERF-06           | UC-07        | NFR-09                 | —                          | `GET /groups/{id}/performance`                        | TC-046 (AC-17)        |
| FR-PERF-08           | UC-07        | §18.4                  | —                          | `GET /groups/{id}/at-risk`                            | TC-047 (AC-15)        |
| FR-PERF-09, 10       | UC-07        | DEC-C04                | Membership                 | `GET /groups/{id}/performance`                        | TC-048                |
| FR-PROG-01…05        | UC-05, UC-08 | BR-50…BR-53            | Coverage, Surah, Hizb      | `GET /me/progress`                                    | TC-049                |
| FR-PAY-01…04, 09, 10 | UC-09        | BR-31…33, BR-54, BR-55 | — (derived)                | `GET /me/payments`                                    | TC-050 (AC-19)        |
| FR-PAY-05, 11        | UC-09        | BR-34, BR-56           | PaymentRecord              | `POST /memberships/{id}/payments`                     | TC-051 (AC-18)        |
| FR-PAY-06            | UC-09        | —                      | —                          | `GET /groups/{id}/payments`                           | TC-052                |
| FR-PAY-07            | UC-02        | BR-55                  | —                          | `GET /me/payments`                                    | TC-053                |
| FR-PAY-12            | UC-13        | BR-42                  | —                          | `GET /me/payments`                                    | TC-054                |
| FR-NOTIF-01…08       | UC-15, UC-18 | BR-46, BR-60, BR-61    | DeviceToken, NotifPref     | `POST /devices`, `PATCH /me/notification-preferences` | TC-055…058            |
| FR-AUDIT-01, 02      | UC-10, UC-14 | BR-62                  | AuditEntry                 | `GET /audit`                                          | TC-059                |
| FR-ADMIN-01          | UC-16        | DEC-B10                | —                          | `GET /memberships/{id}/recovery`                      | TC-060                |
| FR-ADMIN-02          | UC-12, UC-17 | BR-R05                 | User                       | `PATCH /users/{id}/role`                              | TC-061                |
| FR-ADMIN-03          | UC-17        | BR-R03                 | User                       | `PATCH /users/{id}/role`                              | TC-062                |
| NFR-04               | All          | —                      | —                          | —                                                     | TC-063 (AC-22)        |

### 27.4 Acceptance criteria requiring amendment

| AC        | Change                                                                                      | Reason                   |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------ |
| **AC-05** | Test against the corrected score range **9.17–100**, with the tie-break rule                | CON-09, DEC-C05, DEC-D07 |
| **AC-13** | Denominator is **6** expected days, not 7                                                   | DEC-A03                  |
| **AC-14** | "Revision Period" means a day whose report type is `Revision`                               | DEC-A04                  |
| **AC-15** | At-risk = 3 consecutive **expected** days with no report; excused absences break the streak | DEC-B05                  |
| **AC-20** | "permanently deletes" → "becomes inaccessible to every role except Admin recovery"          | DEC-B10                  |
| **AC-21** | Add: the new membership starts with **zero** history and re-seeded coverage                 | DEC-C02                  |

### 27.5 New acceptance criteria required

| #         | Criterion                                                                                                                                                       | Verifies            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **AC-23** | A student who selects 20 non-contiguous ahzab at application shows `ahzab_completed = 20` on day one                                                            | DEC-D01, FR-REQ-05b |
| **AC-24** | A student memorizing backwards (Juz 'Amma → earlier) accumulates coverage correctly and is never told they are at "0% progress"                                 | BR-50, §17.6        |
| **AC-25** | A student who skips a memorized stretch and resumes elsewhere produces two disjoint coverage intervals with no error                                            | BR-50               |
| **AC-26** | A week in which every expected day is `Absent — Sick` yields a null Commitment Score displayed as "not enough data", never 0                                    | DEC-B04             |
| **AC-27** | A `Normal` report with neither memorization nor revision is accepted and counts as a miss on both metrics                                                       | BR-48               |
| **AC-28** | A `Revision`-type day is excluded from `missed_daily_memorization` but included in the `missed_daily_revision` denominator and never counted as a revision miss | BR-47, BR-28a       |
| **AC-29** | Archiving a group auto-rejects its pending requests, blocks reporting, and leaves students enrolled                                                             | DEC-C03, DEC-C06    |
| **AC-30** | Demoting a Teacher assigned to an active group is blocked and names the groups needing reassignment                                                             | BR-44, VR-31        |
| **AC-31** | Two unpaid cycles accumulate; the student's next due date is the **older** one; `Due Soon` applies only to the current cycle                                    | DEC-B06             |
| **AC-32** | The Assistant receives 403 on every report, weekly-report, coverage and performance endpoint                                                                    | DEC-B09             |
| **AC-33** | A removed student appears in last month's group aggregate but not in the current week's at-risk list                                                            | DEC-C04             |
| **AC-34** | The daily reminder fires at 20:00 local, is suppressed after submission, and is absent on recitation days                                                       | DEC-D04             |
| **AC-35** | An attempt to mute an account-critical notification category is rejected server-side                                                                            | BR-61, VR-38        |
| **AC-36** | A membership starting on its group's recitation day yields `expected_days = 0` and a weekly report contributing to no rate                                      | §19.5               |

---

## 28. Edge Cases

Each case gives the scenario, required behaviour, governing requirement, and any residual open question.

### 28.1 Authentication

| ID    | Scenario                                          | Expected behaviour                                                                                      | Requirement  | Open                                 |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------ |
| EC-01 | Registration with an existing email               | Error; remain on form                                                                                   | UC-01 3a     | —                                    |
| EC-02 | Client supplies no or an invalid timezone         | Default to center timezone; flag for refresh                                                            | VR-28, AR-18 | —                                    |
| EC-03 | User changes device timezone mid-week             | Stored value refreshes at next session; **already-submitted reports keep their original `report_date`** | T-05         | —                                    |
| EC-04 | User travels across the date line                 | Their local day shifts; a day may be effectively skipped or doubled                                     | T-01         | ⚠️ Accepted; no compensation defined |
| EC-05 | Password reset requested for a non-existent email | Always return 202; never reveal existence                                                               | API-01       | —                                    |
| EC-06 | Admin attempts to demote themselves               | Blocked                                                                                                 | FR-ADMIN-02  | —                                    |

### 28.2 Join requests and gender

| ID    | Scenario                                                              | Expected behaviour                                                               | Requirement     | Open                      |
| ----- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------- | ------------------------- |
| EC-07 | Applicant declares a gender different from a previous application     | Permitted while `role = User`; once accepted, gender is fixed on the User record | DEC-A05         | Closes OPEN-02            |
| EC-08 | Applicant tampers with `group_id` to target a mismatched-gender group | Rejected server-side                                                             | VR-08           | —                         |
| EC-09 | Group closes between listing and submission                           | Rejected with a stale-state error; list refreshed                                | UC-03 E1, VR-34 | —                         |
| EC-10 | Group archived while a request is pending                             | Auto-rejected, `resolution_source = System`; applicant notified                  | FR-REQ-08       | —                         |
| EC-11 | Group merely closes while a request is pending                        | Request remains reviewable                                                       | FR-REQ-09       | —                         |
| EC-12 | Applicant selects exactly 5 ahzab                                     | Accepted (minimum)                                                               | BR-57           | —                         |
| EC-13 | Applicant selects fewer than 5                                        | Blocked                                                                          | VR-04a          | —                         |
| EC-14 | Two Assistants act on the same request concurrently                   | First write wins; second receives a stale-state error                            | UC-04 E1        | —                         |
| EC-15 | Applicant is accepted to Group A while holding no other request       | Normal path                                                                      | —               | —                         |
| EC-16 | Rejected applicant reapplies immediately, repeatedly                  | Permitted; no cooldown                                                           | BR-06           | ⚠️ ISS-19 — abuse surface |

### 28.3 Membership

| ID    | Scenario                                           | Expected behaviour                                                                                   | Requirement       | Open          |
| ----- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------- | ------------- |
| EC-17 | Accepted on the group's recitation day             | Membership starts; `expected_days = 0` for that week; a weekly report exists contributing to no rate | §19.5, DEC-B04    | —             |
| EC-18 | Removed and re-accepted into the **same** group    | New Membership, zero history, coverage re-seeded from the new application                            | DEC-C02, BR-40    | —             |
| EC-19 | Removed and re-accepted into a **different** group | Same as EC-18; the new group's recitation day governs the new weeks                                  | BR-40             | —             |
| EC-20 | Concurrent acceptance into two groups              | Second blocked by the partial unique index on Active membership                                      | VR-32             | —             |
| EC-21 | Student removed mid-week                           | Weekly metrics truncated at `ended_at`; historical aggregates retain them for the active portion     | FR-WR-10, DEC-C04 | —             |
| EC-22 | Student promoted to Teacher                        | Impossible directly — they must be removed first, reverting to `User`                                | BR-R03            | Closes CON-08 |

### 28.4 Daily reports

| ID    | Scenario                                                                        | Expected behaviour                                         | Requirement     | Open                |
| ----- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------- | ------------------- |
| EC-23 | Second submission for the same date                                             | Rejected; existing report shown                            | VR-11, AC-07    | —                   |
| EC-24 | Submission arrives at 00:00:01 local                                            | Rejected as backdated; **no grace period**                 | VR-10, BR-21    | —                   |
| EC-25 | Submission on the recitation day                                                | Rejected; redirected to the Weekly Report                  | VR-12, AC-10    | —                   |
| EC-26 | `Normal` report with neither memorization nor revision                          | Accepted; counted as a miss on both                        | BR-48           | —                   |
| EC-27 | Memorization range entered in reverse order within one report                   | Rejected with guidance to enter the earlier position first | VR-14a          | —                   |
| EC-28 | Memorization moving backwards day over day                                      | **Accepted** — direction across days is unconstrained      | BR-50, BR-52    | —                   |
| EC-29 | Memorization range overlapping previously covered ayat                          | Accepted; the union absorbs it; nothing double-counted     | §17.6           | —                   |
| EC-30 | Ayah number exceeds the surah's ayah count                                      | Rejected against the reference dataset                     | VR-13           | ⚠️ VER-01           |
| EC-31 | `repetitions_in_single_session = true` while `completed_50_repetitions = false` | Rejected                                                   | VR-18           | —                   |
| EC-32 | Two devices submit concurrently                                                 | Unique constraint rejects the second                       | UC-05 E4        | —                   |
| EC-33 | Coverage update fails after the report is persisted                             | Report stands; coverage repaired by reconciliation         | UC-05 E5, AR-15 | —                   |
| EC-34 | Group archived while the submission screen is open                              | Rejected                                                   | FR-DR-11        | —                   |
| EC-35 | Indefinite consecutive `Revision` reports                                       | Accepted; memorization never penalised                     | BR-49, DEC-D08  | ⚠️ RISK-04 accepted |

### 28.5 Weekly reports

| ID    | Scenario                                              | Expected behaviour                                                                              | Requirement     | Open           |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------- | -------------- |
| EC-36 | Zero daily reports submitted all week                 | Weekly report still produced; all metrics counted as missed                                     | FR-WR-08        | Closes OPEN-07 |
| EC-37 | All expected days `Absent — Sick`                     | Effective days = 0; all metrics 0; contributes to no rate                                       | BR-24, DEC-B04  | —              |
| EC-38 | Not confirmed by local midnight                       | Scheduler finalises with `attended = false`                                                     | FR-WR-06, AC-12 | —              |
| EC-39 | Scheduler fails; report still `Open` next day         | Finalised on the next run with `attended = false`; retroactive confirmation **never** permitted | §19.6           | —              |
| EC-40 | Scheduler runs twice                                  | Idempotent; a finalised report is never rewritten                                               | VR-36, AR-17    | —              |
| EC-41 | Student attempts confirmation on a non-recitation day | Rejected                                                                                        | VR-21           | —              |
| EC-42 | Group archived mid-week                               | Expected days truncated; no further weekly reports                                              | FR-WR-10        | —              |

### 28.6 Performance and metrics

| ID    | Scenario                                                 | Expected behaviour                                                            | Requirement      | Open |
| ----- | -------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------- | ---- |
| EC-43 | Custom period containing no expected days                | All components undefined; score null; UI shows "not enough data"              | DEC-B04          | —    |
| EC-44 | Student enrolled less than one week, `weeks elapsed = 0` | `AttendanceRate` undefined and excluded; the other three may still be defined | DEC-A10, DEC-B04 | —    |
| EC-45 | Every student in a group has a null score                | Group average shows "not enough data"                                         | UC-07 5a         | —    |
| EC-46 | Non-contiguous coverage                                  | `last_memorized_position` presented as an activity pointer only               | DEC-D02          | —    |
| EC-47 | Historical period spanning a removal                     | Removed student included for the active portion                               | FR-PERF-09       | —    |
| EC-48 | At-risk streak interrupted by an excused absence         | Streak **breaks**; student is not at risk                                     | DEC-B05          | —    |
| EC-49 | At-risk streak spanning a recitation day                 | Recitation day is skipped, not counted                                        | DEC-B05          | —    |

### 28.7 Payments

| ID    | Scenario                              | Expected behaviour                                                                         | Requirement | Open      |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------ | ----------- | --------- |
| EC-50 | Cycle ends unpaid                     | New cycle opens; arrears count increments                                                  | BR-54       | —         |
| EC-51 | Three cycles unpaid                   | Next due = **oldest** cycle end; arrears = 3; `Due Soon` applies to the current cycle only | DEC-B06     | —         |
| EC-52 | Assistant pays cycle 2 before cycle 1 | Permitted                                                                                  | BR-56       | —         |
| EC-53 | Attempt to pay an already-paid cycle  | Rejected                                                                                   | VR-26       | —         |
| EC-54 | Attempt to pay a future cycle         | Rejected                                                                                   | VR-37       | 💡        |
| EC-55 | Membership starts 30 November         | Cycle end lands on a short month                                                           | —           | ⚠️ ISS-14 |
| EC-56 | Payment recorded in error             | **No correction path exists**                                                              | —           | ⚠️ ISS-02 |
| EC-57 | Group archived with unpaid cycles     | Cycle generation stops; existing arrears remain visible                                    | FR-PAY-12   | —         |

### 28.8 Groups and staff

| ID    | Scenario                                          | Expected behaviour                                                  | Requirement  | Open      |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------- | ------------ | --------- |
| EC-58 | Delete a group with students                      | Rejected                                                            | BR-43, VR-30 | —         |
| EC-59 | Demote a Teacher assigned to an active group      | Rejected, naming the groups                                         | BR-44, VR-31 | —         |
| EC-60 | Reassign a Teacher mid-week                       | Incoming gains full historical scope; outgoing loses it immediately | UC-11        | ⚠️ ISS-04 |
| EC-61 | Assign a user who does not hold the required role | Rejected                                                            | VR-24        | —         |
| EC-62 | Archive then un-archive a group                   | Reporting resumes; auto-rejected requests are **not** revived       | UC-13        | ⚠️ ISS-09 |
| EC-63 | Toggle enrollment on an archived group            | No effect; archived dominates                                       | BR-42        | —         |

### 28.9 Notifications

| ID    | Scenario                                     | Expected behaviour                                             | Requirement | Open      |
| ----- | -------------------------------------------- | -------------------------------------------------------------- | ----------- | --------- |
| EC-64 | No valid device token at reminder time       | Skipped and logged; never blocks                               | UC-15 E1    | —         |
| EC-65 | Transport reports an invalid token           | Token invalidated                                              | UC-15 E2    | —         |
| EC-66 | Dispatch fails entirely                      | Student remains responsible; non-delivery never excuses a miss | BR-60       | —         |
| EC-67 | Attempt to mute an account-critical category | Rejected server-side                                           | VR-38       | —         |
| EC-68 | Payment `Due Soon` persists for ten days     | Notification should fire once, not daily                       | —           | ⚠️ ISS-17 |

### 28.10 Data deletion

| ID    | Scenario                                                     | Expected behaviour                             | Requirement | Open      |
| ----- | ------------------------------------------------------------ | ---------------------------------------------- | ----------- | --------- |
| EC-69 | Removed student logs in                                      | Sees the User dashboard; no prior data visible | UC-02 2b    | —         |
| EC-70 | Teacher views a historical period covering a removed student | Student appears for the active portion         | FR-PERF-09  | —         |
| EC-71 | Teacher views the current week                               | Removed student absent                         | FR-PERF-10  | —         |
| EC-72 | Admin opens recovery                                         | Retained records visible                       | UC-16       | ⚠️ ISS-10 |

---

## 29. Open Issues

All Critical and High issues from the analysis have been resolved by decision. The following remain, none of which blocks architecture or the start of development.

| ID          | Issue                                                                                                                                                        | Why it matters                                                                                        | Affects           | Recommended decision                                                                                    | Owner         | Severity   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- | ------------- | ---------- |
| **ISS-02**  | No correction path for a mistakenly recorded payment: no update, no delete, and payments are unaudited (DEC-D05)                                             | Cash handling with no reversal and no trail. The only remedy is direct database intervention          | FR-PAY-05, E-07   | Add an Assistant-initiated reversal that writes a compensating record rather than mutating the original | Product Owner | **Medium** |
| **ISS-04**  | Staff reassignment grants the incoming Teacher full historical visibility of reports predating their assignment, and removes it from the outgoing one        | Personal-data scope changes silently; a departing Teacher loses access to their own students' history | UC-11, §14.3      | Confirm this is intended; if not, scope Teacher visibility to their assignment period                   | Product Owner | **Medium** |
| **RISK-08** | Payment recording, student removal, role promotion and staff reassignment are unaudited (DEC-D05). Role promotion and reassignment leave **no trace at all** | The highest-consequence actions are the least traceable                                               | §21               | If revisited, add in order: payment recorded, student removed, role promotion                           | Product Owner | **Medium** |
| **ISS-05**  | NFR-06 refers to "the authentication provider" but names none                                                                                                | Determines whether identity is in-house or managed                                                    | AR-01, EXT-01     | Architecture decision — see ADR-011                                                                     | Architect     | Medium     |
| **ISS-06**  | No email delivery provider named, though FR-AUTH-04 requires one                                                                                             | Password reset cannot ship without it                                                                 | EXT-02            | Architecture decision                                                                                   | Architect     | Medium     |
| **ISS-19**  | No cooldown or rate limit on join applications (BR-06), and no cap on requests per user                                                                      | A user can flood an Assistant's queue                                                                 | FR-JOIN, NFR-22   | Rate-limit submissions; no business rule change needed                                                  | Architect     | Medium     |
| **ISS-01**  | Scheduler failure is silent; no monitoring target defined                                                                                                    | Weekly finalisation stalling would corrupt `AttendanceRate` denominators                              | FR-WR-06, NFR-28  | Define alerting on missed runs                                                                          | Architect     | Low        |
| **ISS-03**  | Demotion of a Teacher/Assistant to `User` is implied by BR-44 but never required by any FR                                                                   | Feature existence is ambiguous                                                                        | ST-01             | Confirm whether demotion is a feature                                                                   | Product Owner | Low        |
| **ISS-07**  | Forced password change on the seeded Admin's first login is recommended but unconfirmed                                                                      | Shipped credentials                                                                                   | FR-AUTH-06        | Confirm                                                                                                 | Product Owner | Low        |
| **ISS-08**  | No retention policy for NotificationLog, AuditEntry or soft-deleted records                                                                                  | DEC-B10 retains personal data indefinitely                                                            | §20, NFR-33       | Define a retention period                                                                               | Product Owner | Low        |
| **ISS-09**  | After un-archiving, whether the archived interval counts as excluded days is undefined                                                                       | Affects metrics only in an uncommon path                                                              | UC-13             | Treat archived days as outside every effective window                                                   | Product Owner | Low        |
| **ISS-10**  | "Restore" in Admin recovery is undefined; DEC-C02 forbids reviving a Membership                                                                              | Recovery may be read/export only                                                                      | UC-16             | Confirm recovery is read/export only                                                                    | Product Owner | Low        |
| **ISS-11**  | NFR-10 does not state whether the Assistant may see an applicant's email                                                                                     | Assistants contact applicants offline                                                                 | §14.4             | Permit; it is operationally necessary                                                                   | Product Owner | Low        |
| **ISS-12**  | `read_tafsir` feeds no metric or dashboard element                                                                                                           | Either informational by design, or a missing element                                                  | §17.5             | Confirm it is informational only                                                                        | Product Owner | Low        |
| **ISS-13**  | `missed_single_session` scoping when the 50 repetitions were not completed                                                                                   | Avoiding a double penalty is a derivation choice, not a stated rule                                   | §18.2             | Confirm the recommended scoping                                                                         | Product Owner | Low        |
| **ISS-14**  | End-of-month arithmetic for 3-month payment cycles                                                                                                           | Affects memberships starting on the 29th–31st                                                         | §18.5             | Clamp to the last valid day                                                                             | Architect     | Low        |
| **ISS-15**  | Authoritative clock source and tolerated skew undefined                                                                                                      | Date derivation must be consistent across instances                                                   | §19.6             | Single clock source                                                                                     | Architect     | Low        |
| **ISS-16**  | Coverage stores current state only; "what had this student memorized as of last month" requires replaying reports                                            | Not needed by any MVP requirement                                                                     | E-08              | Accept for MVP                                                                                          | Architect     | Low        |
| **ISS-17**  | Repeat cadence for N-06 and N-07 is unspecified                                                                                                              | Risk of daily repetition for ten days                                                                 | §22.3             | Fire once per cycle / per episode                                                                       | Product Owner | Low        |
| **ISS-18**  | Pagination parameters for report history endpoints unspecified                                                                                               | Unbounded lists                                                                                       | API-05, API-X04   | Cursor pagination                                                                                       | Architect     | Low        |
| **VER-01**  | Verify the Quran dataset's numbering matches the mushaf the center teaches (Al-Baqara: 286 in Hafs, 285 in Qalun/Warsh)                                      | A mismatch silently corrupts every ayah validation and hizb boundary                                  | FR-PROG-05, VR-13 | One-time verification at implementation                                                                 | Architect     | Low        |

### 29.1 Severity summary

| Severity     | Count | Meaning                                       |
| ------------ | ----- | --------------------------------------------- |
| **Critical** | **0** | Nothing blocks architecture or development    |
| **High**     | **0** | Nothing blocks a feature's implementation     |
| **Medium**   | 6     | Resolve during design of the affected feature |
| **Low**      | 15    | Can be deferred                               |

### 29.2 Risk register (carried forward)

| ID          | Risk                                                                 | Severity         | Status                                                  |
| ----------- | -------------------------------------------------------------------- | ---------------- | ------------------------------------------------------- |
| RISK-01     | Hard delete destroys memorization history                            | High             | ✅ **Mitigated** by DEC-B10                             |
| RISK-02     | No notifications works against the 80% target                        | High             | ✅ **Mitigated** by DEC-C10                             |
| RISK-03     | All report content is self-declared and unverifiable                 | Medium           | ⚠️ **Accepted**; NFR-18 mitigates presentation          |
| RISK-04     | Unbounded revision periods avoid memorization penalties indefinitely | Medium           | ⚠️ **Accepted** by DEC-D08                              |
| RISK-05     | No connectivity fallback in a variable-network context               | Medium           | ⚠️ **Accepted**; NFR-02, FI-03 deferred                 |
| RISK-06     | Client-controlled timezone weakens BR-20/BR-21                       | Medium → **Low** | ✅ Reduced by DEC-B03 (persisted, server-authoritative) |
| RISK-07     | Per-student week boundaries desynchronise group aggregation          | Medium → **Low** | ✅ Reduced — aggregates are date-keyed (§19.3)          |
| **RISK-08** | The highest-consequence actions are unaudited                        | **Medium**       | ⚠️ **NEW** — consequence of DEC-D05                     |

---

## 30. Architecture Decisions

### ADR-001 — Membership modelling

**Decision.** Introduce a first-class `Membership` entity. Reports, weekly reports, payments and coverage are owned by Membership, not by User.

**Options.** (A) `User.group_id` foreign key, as in SRS §8.1. (B) A `Membership` entity with lifecycle states. (C) A membership-history table alongside `User.group_id`.

**Chosen: B.** **Reason:** DEC-B10 (soft delete) and DEC-C02 (rejoin starts fresh) together make A structurally impossible — there is no way to scope a report to "which enrollment" without a membership identity, and no way to bound a historical aggregate without start and end dates. C duplicates the source of truth. **Impact:** every report, payment and coverage row keys on `membership_id`; DEC-C04's period-aware historical aggregation becomes a simple date-range intersection instead of special-case logic. **Status:** Decided.

### ADR-002 — Day-boundary authority

**Decision.** Persist an IANA timezone on the User record and treat it as the server-side authority for all date derivation.

**Options.** (A) Per-request client timezone header. (B) Persisted per-user timezone. (C) Fixed center timezone for everyone.

**Chosen: B** (DEC-A02 + DEC-B03). **Reason:** A cannot be trusted for VR-10 and gives the Scheduler no stable key. C was rejected by the stakeholder in favour of each student's own local day. B preserves the stakeholder's intent while giving the server a stable, auditable, schedulable value. **Impact:** reduces RISK-06 and RISK-07 to Low; requires per-timezone scheduling (AR-05); requires the timezone on the session hot path. **Status:** Decided.

### ADR-003 — Weekly report computation strategy

**Decision.** Compute on read while `Open`; snapshot the metrics at finalisation and never recompute.

**Options.** (A) Always compute on read. (B) Always materialise. (C) Hybrid — compute while open, snapshot at finalisation.

**Chosen: C.** **Reason:** BR-21 and BR-22 make a finalised week's inputs immutable, so recomputation can never yield a different answer. Snapshotting is therefore free correctness-wise and directly serves NFR-12. Before finalisation the inputs can still change, so computation must be live. **Impact:** finalisation becomes the single write point; historical dashboards read snapshots. **Status:** Decided.

### ADR-004 — Commitment Score computation

**Decision.** Compute on read, per requested period, with optional read-side caching keyed on `(membership, period, latest_report_timestamp)`.

**Options.** (A) On read. (B) Incrementally maintained. (C) Nightly batch.

**Chosen: A**, with AR-14 caching. **Reason:** DEC-A10 makes the period caller-supplied, so no stored value can be correct for an arbitrary filter. B and C both assume a fixed window that does not exist. **Impact:** dashboard performance rests entirely on the §24.6 indexes; DEC-C11 removes the ability to size caching empirically, so the query must be correct by construction rather than fast by luck. **Status:** Decided.

### ADR-005 — Quran reference data

**Decision.** Load the supplied JSON into read-only reference tables via a versioned deployment migration; precompute the ayah ordinal index.

**Options.** (A) Bundle the JSON in the client only. (B) Reference tables in the database. (C) External API.

**Chosen: B.** **Reason:** VR-13 must be enforced server-side (NFR-08), so the server needs the data regardless. Ordinal arithmetic (§17.6) must happen where coverage is computed. C introduces a runtime dependency for data that never changes. **Impact:** the dataset version must be recorded — if a correction ever changes ayah counts, every stored ordinal becomes invalid, and the version stamp is what makes that detectable. The client may additionally bundle a copy for offline form validation. **Status:** Decided; VER-01 outstanding.

### ADR-006 — Payment modelling

**Decision.** Persist payment **events** only. Derive the cycle ledger and all statuses arithmetically.

**Options.** (A) Materialise a row per cycle with a stored status. (B) Persist payments only; derive cycles. (C) Materialise cycles, derive status.

**Chosen: B.** **Reason:** DEC-A06 requires derived status; cycles are pure arithmetic over `started_at`. A would need a nightly generation job **and** a nightly status job, both of which exist only to reproduce a calculation. B eliminates both, makes VR-26 a unique constraint on `(membership_id, cycle_index)`, and makes arrears a set difference. **Impact:** no scheduled payment job at all; the ledger is computed per request. **Status:** Decided.

### ADR-007 — Deletion strategy

**Decision.** Soft delete with Admin-only recovery.

**Options.** (A) Hard delete as specified in BR-05. (B) Soft delete. (C) Hybrid — purge personal data, retain anonymised reporting history.

**Chosen: B** (DEC-B10). **Reason:** A destroys exactly the memorization history the product exists to preserve (pain point #1) and, after DEC-A01, also destroys ahzab-progress data. B leaves AC-20's observable behaviour unchanged while making the loss recoverable. C was not required and complicates FR-PERF-09. **Impact:** supersedes BR-05 and §8.3; requires soft-delete-aware data access (AR-07) with two period-aware exceptions; introduces an indefinite personal-data retention question (ISS-08). **Status:** Decided.

### ADR-008 — Memorization progress model

**Decision.** Interval-set coverage over a canonical ayah ordinal.

**Options.** (A) Single furthest-forward position pointer. (B) Interval-set coverage (union of all submitted ranges). (C) Per-hizb completion flags maintained manually.

**Chosen: B** (DEC-B02, DEC-D01). **Reason:** the stakeholder confirmed that memorization may run forward, backward, from a middle point in either direction, **and** may skip an already-memorized stretch and resume elsewhere (BR-50). A is wrong for every one of those patterns except pure forward order. C requires a human judgement the app does not have (hizb verification is out of scope, DEC-014). B handles all five patterns with no special cases: a skip simply produces a second disjoint interval. **Impact:** requires ordinal precomputation (ADR-005), a child interval table, merge-on-insert, and materialisation (AR-08). It also forces the rename of "current position" to `last_memorized_position` (DEC-D02), because under non-linear memorization a single pointer cannot mean progress. **Status:** Decided.

### ADR-009 — Notification delivery

**Decision.** Provider-agnostic dispatch behind an internal interface, with per-timezone scheduling and best-effort semantics.

**Options.** (A) Direct FCM/APNs calls at the call site. (B) Internal notification service with a transport adapter. (C) Third-party notification platform.

**Chosen: B.** **Reason:** eight event types (§22.2) with differing suppression rules, muting rules and recipients need one place to enforce BR-46, BR-60 and BR-61. Scattering transport calls across use cases would make VR-39 unenforceable. **Impact:** requires token lifecycle management (E-09), preference resolution (E-10) and dispatch logging (E-11). **Status:** Decided; provider selection outstanding.

### ADR-010 — Report immutability enforcement

**Decision.** Enforce immutability at the storage layer, not only in application code.

**Options.** (A) Application-layer only. (B) Database-level (no UPDATE grant, or a trigger rejecting updates to non-lifecycle columns). (C) Event sourcing.

**Chosen: B.** **Reason:** BR-22, FR-DR-04, FR-WR-07 and NFR-17 make immutability a core product guarantee, and AC-09 tests it. An application-only guard is defeated by any future code path, including a well-meaning migration. C is disproportionate. **Impact:** `deleted_at` and the weekly-report lifecycle columns must be explicitly exempted from the restriction. **Status:** Decided.

### ADR-011 — Identity and credential management

**Decision.** ⚠️ **Open.** NFR-06 refers to "the authentication provider" without naming one (ISS-05).

**Options.** (A) In-house credential storage with a standard hashing algorithm. (B) A managed identity provider. (C) A framework-supplied auth module.

**Analysis.** The requirement set is modest: email/password, password reset, session management, and a seeded account (FR-AUTH-01…06). There is no SSO, no social login and no MFA requirement. Against that, DEC-C10 already introduces one external dependency (EXT-03) and FR-AUTH-04 requires another (EXT-02). **Impact:** affects AR-01, EXT-01, EXT-02 and NFR-21. **Status:** Architect decision; not blocking.

### ADR-012 — API protocol style

**Decision.** ⚠️ **Deliberately open.** §23 derives the API _surface_ without prescribing protocol style, versioning or token format. The read patterns are period-parameterised aggregates over a small resource set, which suits either REST or GraphQL. **Status:** Architect decision; explicitly out of analysis scope.

---

## 31. MVP System Boundaries

### 31.1 In scope — MVP

| Capability                                                                       | Basis                                  |
| -------------------------------------------------------------------------------- | -------------------------------------- |
| Email/password self-registration and authentication                              | FR-AUTH ✅                             |
| Multi-step join application with ahzab selection and automatic scoring           | FR-JOIN ✅ + DEC-D01                   |
| Join request review, acceptance, rejection, auto-rejection on archival           | FR-REQ ✅ + DEC-C06                    |
| Group creation, staff assignment and reassignment, enrollment toggle, archival   | FR-GRP ✅ + DEC-A09, DEC-B07           |
| Daily Report submission — 3 types, immutable, non-backdatable                    | FR-DR ✅                               |
| Weekly Report — auto-computed, student-confirmed, scheduler-finalised, prorated  | FR-WR ✅ + DEC-A07                     |
| Commitment Score, dashboards, at-risk detection, period filters                  | FR-PERF ✅ + DEC-A10, DEC-B04, DEC-B05 |
| **Memorization coverage and ahzab-completed tracking**                           | FR-PROG — **promoted from FI-08**      |
| Payment ledger with derived status, arrears and out-of-order recording           | FR-PAY ✅ + DEC-A06, DEC-B06           |
| **Push notifications — 8 events, per-timezone, mutable except account-critical** | FR-NOTIF — **promoted from FI-02**     |
| **Soft delete with Admin recovery**                                              | FR-GRP-08a — **promoted from FI-04**   |
| Audit logging — three actions                                                    | FR-AUDIT + DEC-D05                     |
| Arabic-only, full RTL mobile application                                         | NFR-03, NFR-04 ✅                      |

### 31.2 Out of scope — MVP

| Excluded                                                               | Basis                    |
| ---------------------------------------------------------------------- | ------------------------ |
| Online payment processing                                              | FI-01, FR-PAY-08 ⏳      |
| Email, SMS or WhatsApp notifications                                   | DEC-D04 ⏳               |
| In-app notification centre or history                                  | Not requested ⏳         |
| Offline mode, drafting, local sync                                     | NFR-02, FI-03 ⏳         |
| In-app recitation, audio or video                                      | BR-18, FI-06 ⏳          |
| Teacher grading, correction, comments                                  | DEC-009, FI-05 ⏳        |
| Hizb pass/fail verification                                            | DEC-014 ⏳               |
| Formal Revision Period lifecycle; any cap on consecutive revision days | BR-28, BR-49, DEC-D08 ⏳ |
| Multi-center support                                                   | FI-09 ⏳                 |
| Group capacity limits and waitlists                                    | BR-09, FI-10 ⏳          |
| Report editing or deletion by any role                                 | BR-22 ⏳                 |
| Chat or messaging                                                      | FI-16 ⏳                 |
| Rejection reasons and applicant feedback                               | FI-12 ⏳                 |
| Cancelling one's own pending request                                   | FI-13 ⏳                 |
| Multiple Admin accounts                                                | BR-R05, FI-11 ⏳         |
| Configurable repetition target per group                               | BR-26, FI-14 ⏳          |
| Additional languages                                                   | NFR-03, FI-15 ⏳         |
| A user-facing audit log UI                                             | DEC-D05 ⏳               |
| Audit of payments, removals, promotions, reassignments                 | DEC-D05 ⏳ (see RISK-08) |
| Payment correction or reversal                                         | ⏳ (see ISS-02)          |
| Historical coverage snapshots                                          | ⏳ (see ISS-16)          |

### 31.3 Scope changes made during analysis

| Change                                               | Direction        | Basis                           |
| ---------------------------------------------------- | ---------------- | ------------------------------- |
| Push notifications                                   | **Added** to MVP | DEC-C10 — mitigates RISK-02     |
| Soft delete                                          | **Added** to MVP | DEC-B10 — mitigates RISK-01     |
| Hizb-boundary detection and ahzab-completed progress | **Added** to MVP | DEC-A01, DEC-B02                |
| Ahzab selection at application                       | **Added** to MVP | DEC-D01 — replaces a bare count |
| Group `Archived` state                               | **Added** to MVP | DEC-B07 — closes OPEN-05        |
| Staff reassignment                                   | **Added** to MVP | DEC-A09                         |
| Age eligibility limits                               | **Removed**      | DEC-D06 — no restriction        |
| Hard delete                                          | **Removed**      | DEC-B10                         |

**Net effect.** The MVP is materially larger than SRS v1.0 described. The three additions all trace to risks or contradictions the SRS itself flagged (RISK-01, RISK-02, FI-08 versus §9.4.1), so they are corrections rather than scope creep — but the delivery plan must account for a notification subsystem, a progress engine and soft-delete-aware data access that the original scope did not contain.

---

## 32. Future Considerations

### 32.1 Deferred by explicit decision

| #     | Item                                                            | Note                                                                              |
| ----- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| FI-01 | Online payment processing                                       | Manual tracker in MVP                                                             |
| FI-03 | Offline report drafting with sync                               | Remains relevant: a midnight cutoff plus variable connectivity (RISK-05)          |
| FI-05 | Teacher write actions                                           | Teacher is read-only                                                              |
| FI-06 | In-app recitation logging                                       | On WhatsApp                                                                       |
| FI-07 | Formal Revision Period lifecycle with declaration and pass/fail | Would close RISK-04, accepted in MVP by DEC-D08                                   |
| FI-09 | Multi-center support                                            | The Membership model already accommodates it; Group would need a center reference |
| FI-10 | Capacity limits and waitlists                                   | The scored queue (FR-REQ-02) is a natural waitlist                                |
| FI-11 | Multiple Admins with an audit trail                             | Related to RISK-08                                                                |
| FI-12 | Rejection reasons and applicant feedback                        | —                                                                                 |
| FI-13 | Cancel own pending request                                      | —                                                                                 |
| FI-14 | Configurable repetition target per group                        | BR-26 fixes it at 50                                                              |
| FI-15 | Additional languages                                            | Arabic only                                                                       |
| FI-16 | Messaging                                                       | —                                                                                 |

### 32.2 Arising from this analysis

| #         | Item                                                                                                           | Rationale                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FI-17** | **Audit the high-consequence actions** — payment recorded, student removed, role promotion, staff reassignment | RISK-08. Role promotion and reassignment currently leave no trace at all                                                                                              |
| **FI-18** | **Payment correction / reversal**                                                                              | ISS-02. Cash handling with no reversal path is operationally fragile                                                                                                  |
| **FI-19** | **Multiple memorization ranges per day**                                                                       | If the domain ever allows more than one range, cardinality becomes 0..N and the value objects of §17.4 must be promoted to entities. Worth anticipating in the schema |
| **FI-20** | **Historical coverage snapshots**                                                                              | ISS-16. Would answer "what had this student memorized as of date X" without replaying reports                                                                         |
| **FI-21** | **Membership `Suspended` state**                                                                               | ST-03. Pausing a student without deleting their history is currently impossible; removal is the only tool                                                             |
| **FI-22** | **Teacher visibility scoped to assignment period**                                                             | ISS-04, if full historical visibility on reassignment proves undesirable                                                                                              |
| **FI-23** | **Data retention and erasure policy**                                                                          | ISS-08, NFR-33. Soft delete retains personal data indefinitely                                                                                                        |
| **FI-24** | **Cap or visibility on consecutive revision days**                                                             | RISK-04, accepted by DEC-D08. A read-only "consecutive revision days" figure on the Teacher's dashboard would surface the pattern without adding a business rule      |
| **FI-25** | **Cross-membership progress carry-forward**                                                                    | DEC-C02 starts rejoining students from zero. If the center later wants lifetime progress, the Membership model supports it — only the seeding rule would change       |
| **FI-26** | **Notification cadence controls**                                                                              | ISS-17                                                                                                                                                                |
| **FI-27** | **Reference dataset versioning and migration**                                                                 | ADR-005. A dataset correction would invalidate every stored ordinal                                                                                                   |

### 32.3 Evolution the model already supports

Worth noting for planning, because these need no restructuring:

| Future need                                       | Why it is already supported                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Membership history and lifetime progress          | Membership entity exists with start and end dates                            |
| Soft-delete recovery and archival policies        | `deleted_at` is already on every relevant table                              |
| Multi-center                                      | Only Group needs a center reference; all scoping already flows through Group |
| Waitlists                                         | The scored, sorted pending queue is already a ranked list                    |
| Additional weekly metrics                         | All metrics derive from a single `classify()` function (§17.3)               |
| Non-linear memorization patterns not yet imagined | The interval-set model stores coverage, not direction (§17.6)                |

---

## Appendix A — Final Self-Review

| Criterion                  | Assessment                                                                                                                                                                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Completeness**           | An architect can proceed. Every entity, state, rule, permission, metric formula and API surface is specified, with 0 Critical and 0 High open issues. The remaining 21 issues are design-time or deferrable.                                                                                       |
| **Consistency**            | The 11 contradictions found in SRS v1.0 (CON-01…CON-11) are all resolved: by stakeholder decision (CON-01…07, CON-10), by precedence ruling (CON-08), or by arithmetic correction (CON-09, CON-11). Superseded SRS statements are listed explicitly in §1.5 rather than silently overwritten.      |
| **Traceability**           | §27 chains every functional requirement through use case, rule, entity, API and test. Six SRS acceptance criteria require amendment; fourteen new ones are specified.                                                                                                                              |
| **Testability**            | Every FR maps to at least one TC. The metric specifications in §18 are deterministic — every one derives from the single `classify()` function of §17.3, so the metrics cannot disagree with each other.                                                                                           |
| **Data integrity**         | Five uniqueness rules are identified as **concurrency hazards** requiring database constraints rather than application checks (§15.9, §24.6). All foreign keys are RESTRICT; nothing cascades, because a cascade would defeat soft delete.                                                         |
| **Authorization**          | §13 splits administrative from enrollment promotion, correcting the SRS matrix. §14 adds instance-level scope beyond RBAC, including the period-aware exception that lets a Teacher see a removed student historically but not currently.                                                          |
| **Lifecycle**              | Seven state models. Every transition names its trigger, actor and guard. States not supported by the SRS or a decision are marked proposed rather than assumed.                                                                                                                                    |
| **Edge cases**             | 72 cases across 10 categories, each with expected behaviour and requirement. Twelve carry a residual open question, all Low or Medium.                                                                                                                                                             |
| **Ambiguity**              | 21 open issues, each with severity, affected requirements, recommended decision and owner. Nothing was silently decided. Where a derivation choice was necessary and unstated — the `missed_single_session` scoping — it is marked 💡 and logged as ISS-13 rather than presented as a requirement. |
| **Separation of concerns** | Business rules (§7), system behaviour (§11, §18) and technical implementation (§24.5, §26, §30) are separated. Domain model (§8) precedes the relational proposal (§24.5). No SQL, no code, no technology selected.                                                                                |

### A.1 Where this document exceeds the SRS, and why

Three additions were made that SRS v1.0 did not contain. Each traces to a problem the SRS itself identified:

1. **A notification subsystem** — because RISK-02 stated that no notifications plus a hard midnight cutoff works against the primary success metric, and the stakeholder agreed (DEC-C10).
2. **A memorization progress engine** — because §9.4.1 required ahzab-completed progress while FI-08 deferred the capability that produces it (CON-03), and the stakeholder retained the dashboard element (DEC-A01).
3. **A Membership entity** — because soft delete and fresh rejoin cannot be expressed by a foreign key on User (ADR-001).

### A.2 The two things most likely to be got wrong in implementation

Stated plainly, because both are silent failures:

1. **Confusing Daily Revision with a Revision Period** (§17.2). They are orthogonal. A `Revision`-type day satisfies daily revision _and_ excuses memorization; a `Normal` day without revision is a miss _even though memorization occurred_. Conflating them produces metrics that look plausible and are wrong.
2. **Treating an undefined metric component as zero** (DEC-B04). A student who was legitimately ill all week has an _undefined_ rate, not a rate of 0. Substituting zero punishes exactly the students BR-24 exists to protect, and the resulting Commitment Score will look like a real number rather than an error.

---

_End of document._
