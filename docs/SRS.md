# Software Requirements Specification
# Irtaki — Quran Memorization Mobile Application

| Field | Value |
|---|---|
| Document version | 1.0 |
| Status | Draft — pending resolution of Open Items (§15) |
| Scope | MVP |
| Prepared by | Business Analyst |
| Audience | Product Owner, UX Designer, Software Architect, Developers, QA |

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements for the MVP of **Irtaki**, a mobile application that digitises the administration and follow-up of Quran memorization groups for a single existing Quran center.

### 1.2 Problem statement
The center currently runs memorization groups without a system of record. Three problems were identified and ranked by the stakeholder:

| Rank | Problem | Addressed by |
|---|---|---|
| 1 | Teachers lose track of what each student has memorized | Daily/Weekly Reports, Performance Dashboards |
| 2 | Students drop off silently with no early signal | Commitment Score, At-Risk list |
| 3 | Fee collection is untracked | Payment Tracker (offline record only) |

### 1.3 Definitions

| Term | Definition |
|---|---|
| **Hizb** | A division of the Quran. The Quran contains 60 ahzab. |
| **Memorization Day** | One of the 6 weekly days on which a student memorizes new content and submits a Daily Report. |
| **Recitation Day** | The single weekly day, fixed per group, on which the group recites to the teacher **over WhatsApp, outside the application**. The student submits a Weekly Report on this day. |
| **Revision Period** | A personal (not group-wide) stretch of days during which a student consolidates a completed hizb instead of memorizing new content. |
| **Commitment Score** | A computed 0–100 indicator of a student's consistency. See §9.4. |
| **Tafsir** | Exegesis reading, recorded as a yes/no flag on the Daily Report. |

### 1.4 Scope boundary
Irtaki is a **record-keeping and follow-up system**, not a teaching or examination system. The act of reciting, the teacher's live correction, and the pass/fail judgement of a completed hizb all occur outside the application and are explicitly out of scope.

---

## 2. Product Scope

### 2.1 In scope (MVP)

- Email/password authentication (self-registration)
- Group browsing and join application via a multi-step form
- Automatic scoring and ranking of join applications
- Join request review (accept / reject) by the Assistant
- Daily Report submission by Students (3 report types)
- Weekly Report — auto-calculated, student-confirmed
- Performance dashboards for the Teacher (group and individual)
- Offline payment status tracking
- Group creation and staff assignment by a single seeded Admin
- Arabic-only, right-to-left mobile interface

### 2.2 Explicitly out of scope (MVP)

| Excluded | Rationale |
|---|---|
| Online payment processing | Payment is a manual tracker; money changes hands offline |
| Push notifications / reminders | Stakeholder decision (DEC-024) |
| Offline mode / local sync | Stakeholder decision (DEC-026) |
| In-app recitation, audio, or video | Recitation happens on WhatsApp |
| Teacher grading, correction, or evaluation | Teacher is read-only (DEC-009) |
| Hizb pass/fail verification | Occurs between student and a colleague, outside the app (DEC-014) |
| Multi-center / multi-branch support | Single center only |
| Group capacity limits | Enrollment controlled by the open/closed toggle (DEC-006) |
| Report editing or deletion by students | Reports are immutable (DEC-020) |
| Chat / messaging | Not requested |

---

## 3. Actors and Roles

| Actor | Description | Account origin |
|---|---|---|
| **Admin** | A single, system-seeded account. Owns groups and staff assignment. | Seeded at installation. Not creatable through the UI. |
| **User** | Any self-registered person who is not yet a member of a group. Default state after registration. | Self-registration |
| **Student** | A User whose join request has been accepted. Bound to exactly one group. | Promotion via join acceptance |
| **Assistant** | Administrative staff for one or more groups. Handles join requests and payment records. | Promoted from User by Admin |
| **Teacher** | Pedagogical lead of one or more groups. Read-only, except for the enrollment toggle. | Promoted from User by Admin |

### 3.1 Role rules

- **BR-R01** — A person holds exactly one role at any time. Multi-role accounts are not supported.
- **BR-R02** — Self-registration always produces a **User**. Teacher, Assistant, and Admin roles can never be self-selected.
- **BR-R03** — Only the Admin may promote a User to Teacher or Assistant.
- **BR-R04** — Role promotion carries no history. A promoted account retains no prior student data.
- **BR-R05** — Exactly one Admin account exists in the system.

### 3.2 Role cardinality

```
Admin      1  ──manages──▶  N  Group
Teacher    1  ──leads────▶  N  Group
Assistant  1  ──supports─▶  N  Group
Group      1  ──has──────▶  1  Teacher
Group      1  ──has──────▶  1  Assistant
Group      1  ──contains─▶  N  Student
Student    1  ──belongs──▶  1  Group
User       1  ──has──────▶  0..1 active JoinRequest
```

> **Correction to the source document:** the original stated `User 1 → 1 Join Request`. The correct cardinality is `1 → 0..1 active`, with an unlimited number of historical (rejected) requests.

---

## 4. User Stories

### 4.1 User (unassigned)
- **US-01** — As a User, I register with an email and password so that I can access the application.
- **US-02** — As a User, I declare my gender so that only compatible groups are shown to me.
- **US-03** — As a User, I browse open groups matching my gender so that I can choose one to join.
- **US-04** — As a User, I complete an application form so that the center can evaluate my level.
- **US-05** — As a User, I see the status of my pending request so that I know whether I have been accepted.

### 4.2 Student
- **US-06** — As a Student, I submit a Daily Report each memorization day so that my progress is recorded.
- **US-07** — As a Student, I declare an absence with a reason so that legitimate absences are not counted against me.
- **US-08** — As a Student, I review my auto-generated Weekly Report and confirm whether I attended the recitation call.
- **US-09** — As a Student, I view my own commitment score and progress so that I can monitor myself.
- **US-10** — As a Student, I view my payment status so that I know when my next fee is due.

### 4.3 Assistant
- **US-11** — As an Assistant, I review join requests ranked by score so that I admit the most suitable applicants first.
- **US-12** — As an Assistant, I accept or reject a request so that group membership is controlled.
- **US-13** — As an Assistant, I record that a student has paid so that the center tracks fee collection.
- **US-14** — As an Assistant, I see which students are unpaid or due soon so that I can follow up.

### 4.4 Teacher
- **US-15** — As a Teacher, I view my group's aggregate commitment so that I can judge overall health.
- **US-16** — As a Teacher, I see which students have stopped submitting so that I can intervene early.
- **US-17** — As a Teacher, I view an individual student's progress and consistency so that I know what they have memorized.
- **US-18** — As a Teacher, I open a student's raw daily reports when the charts are not sufficient.
- **US-19** — As a Teacher, I open or close my group's enrollment so that I control intake timing.

### 4.5 Admin
- **US-20** — As an Admin, I create a group and set its gender and recitation day.
- **US-21** — As an Admin, I assign one Teacher and one Assistant to each group.
- **US-22** — As an Admin, I promote a User to Teacher or Assistant.
- **US-23** — As an Admin, I remove a Student from a group.

---

## 5. Functional Requirements

### 5.1 Authentication & Account (FR-AUTH)

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-01 | The system shall allow self-registration with email and password only. | Must |
| FR-AUTH-02 | The system shall assign the role `User` to every newly registered account. | Must |
| FR-AUTH-03 | The system shall authenticate returning users via email and password. | Must |
| FR-AUTH-04 | The system shall provide a password reset flow via email. | Must |
| FR-AUTH-05 | The system shall route the user to the dashboard corresponding to their role on login. | Must |

### 5.2 Group Browsing & Join Request (FR-JOIN)

| ID | Requirement | Priority |
|---|---|---|
| FR-JOIN-01 | The system shall present the join process as a multi-step form (stepper). | Must |
| FR-JOIN-02 | Step 1 shall capture the applicant's gender. | Must |
| FR-JOIN-03 | Step 2 shall list only groups whose gender matches the declared gender **and** whose enrollment status is `Open`. | Must |
| FR-JOIN-04 | Step 3 shall capture the full applicant profile (see §9.2). | Must |
| FR-JOIN-05 | The system shall reject the application if `Program Goal` is not `Memorization`. | Must |
| FR-JOIN-06 | The system shall require explicit agreement to the 30 TND quarterly fee before submission. | Must |
| FR-JOIN-07 | The system shall compute an Applicant Score on submission (see §9.3). | Must |
| FR-JOIN-08 | The system shall store the request with status `Pending`. | Must |
| FR-JOIN-09 | The system shall prevent a User from holding more than one `Pending` request. | Must |
| FR-JOIN-10 | The system shall prevent a Student from submitting a join request while enrolled. | Must |
| FR-JOIN-11 | The system shall display the current status of a User's pending request. | Must |
| FR-JOIN-12 | The system shall **not** provide a cancel action for a pending request. | Must |

### 5.3 Join Request Management (FR-REQ)

| ID | Requirement | Priority |
|---|---|---|
| FR-REQ-01 | The Assistant shall see pending requests for their assigned groups only. | Must |
| FR-REQ-02 | The list shall be sorted by Applicant Score, descending. | Must |
| FR-REQ-03 | The Assistant shall be able to open the full applicant profile. | Must |
| FR-REQ-04 | The Assistant shall accept or reject a request. | Must |
| FR-REQ-05 | On acceptance, the system shall promote the User to `Student`, bind them to the group, and set the payment cycle start date to the acceptance date. | Must |
| FR-REQ-06 | On rejection, the system shall set the request status to `Rejected`. No reason is captured. | Must |
| FR-REQ-07 | A rejected applicant shall be permitted to submit a new request immediately. | Must |

### 5.4 Group Management (FR-GRP)

| ID | Requirement | Priority |
|---|---|---|
| FR-GRP-01 | The Admin shall create a group specifying name, gender, and recitation day. | Must |
| FR-GRP-02 | The Admin shall assign exactly one Teacher and one Assistant per group. | Must |
| FR-GRP-03 | The system shall not permit a group to exist without both a Teacher and an Assistant. | Must |
| FR-GRP-04 | The recitation day shall be immutable after creation. | Must |
| FR-GRP-05 | The Teacher shall toggle the group's enrollment status between `Open` and `Closed`. | Must |
| FR-GRP-06 | The system shall not enforce any maximum student count. | Must |
| FR-GRP-07 | The Admin shall remove a Student from a group. | Must |
| FR-GRP-08 | On removal, the system shall revert the account to `User` and **permanently delete** all of that student's reports and payment records. | Must |

### 5.5 Daily Report (FR-DR)

| ID | Requirement | Priority |
|---|---|---|
| FR-DR-01 | A Student shall submit at most one Daily Report per calendar date. | Must |
| FR-DR-02 | The submission window shall close at midnight, device-local time. | Must |
| FR-DR-03 | The system shall not permit submission for any date other than the current date. | Must |
| FR-DR-04 | A submitted report shall be immutable — no edit, no delete. | Must |
| FR-DR-05 | The Student shall select one report type: `Normal`, `Absent`, or `Revision`. | Must |
| FR-DR-06 | The system shall not permit a Daily Report on the group's recitation day. | Must |
| FR-DR-07 | For `Normal`, the system shall capture memorization range, memorization time, revision range, revision time, repetition flags, and tafsir flag (see §9.5). | Must |
| FR-DR-08 | For `Absent`, the system shall capture a reason: `Sick`, `Studying`, or `Other`. | Must |
| FR-DR-09 | For `Revision`, the system shall capture the revision range only. | Must |
| FR-DR-10 | The Student shall view their own report history. | Must |

### 5.6 Weekly Report (FR-WR)

| ID | Requirement | Priority |
|---|---|---|
| FR-WR-01 | The system shall generate the Weekly Report automatically from the seven daily records of the reporting week. | Must |
| FR-WR-02 | The Weekly Report shall be presented to the Student on the group's recitation day. | Must |
| FR-WR-03 | The system shall display all computed metrics as read-only. | Must |
| FR-WR-04 | The only student input shall be the `Attended Recitation Call` checkbox. | Must |
| FR-WR-05 | Submission shall consist solely of confirming that checkbox. | Must |
| FR-WR-06 | If the Weekly Report is not submitted by midnight of the recitation day, the system shall record `Attended Recitation Call = No` and finalise the report. | Must |
| FR-WR-07 | A finalised Weekly Report shall be immutable. | Must |

### 5.7 Performance Tracking (FR-PERF)

| ID | Requirement | Priority |
|---|---|---|
| FR-PERF-01 | The Teacher shall access a group dashboard for each assigned group. | Must |
| FR-PERF-02 | The Teacher shall access an individual dashboard for each student in their groups. | Must |
| FR-PERF-03 | All dashboards shall support a period filter: Week, Month, 3 Months, Custom range. | Must |
| FR-PERF-04 | The Teacher shall open the raw daily report list for any student in their groups. | Should |
| FR-PERF-05 | The Student shall see their own commitment score and progress. | Must |
| FR-PERF-06 | A Teacher shall not access data for groups they are not assigned to. | Must |

### 5.8 Payments (FR-PAY)

| ID | Requirement | Priority |
|---|---|---|
| FR-PAY-01 | The system shall record a fixed fee of 30 TND per 3-month cycle for every student. | Must |
| FR-PAY-02 | The first cycle shall begin on the date the User became a Student. | Must |
| FR-PAY-03 | The system shall derive a payment status of `Paid`, `Due Soon`, or `Unpaid`. | Must |
| FR-PAY-04 | Status shall become `Due Soon` 10 days before the cycle end date. | Must |
| FR-PAY-05 | The Assistant shall mark a student's cycle as paid. | Must |
| FR-PAY-06 | The Assistant shall view a list of students filtered by payment status. | Must |
| FR-PAY-07 | The Student shall view their own payment status and next due date. | Must |
| FR-PAY-08 | The system shall not process, transfer, or hold funds. | Must |

---

## 6. Use Cases

### UC-01 — Register and Log In
**Actor:** User · **Precondition:** none
1. Actor supplies email and password.
2. System validates uniqueness and password strength.
3. System creates the account with role `User`.
4. System authenticates and opens the User dashboard.

**Alternate 3a:** Email already registered → system displays an error and remains on the form.

---

### UC-02 — See Dashboard
**Actor:** Admin, User, Student, Assistant, Teacher · **Trigger:** app opened
1. System authenticates the session.
2. System resolves the actor's role.
3. System renders the corresponding dashboard.

| Role | Dashboard content |
|---|---|
| User | Join-a-group entry point, or pending request status |
| Student | Today's report action, commitment score, payment status |
| Assistant | Pending request count, payment follow-up list |
| Teacher | Assigned groups with commitment averages and at-risk counts |
| Admin | Groups, staff, and student management |

---

### UC-03 — Apply to Join a Group
**Actor:** User · **Precondition:** actor has no pending request and is not a Student

1. Actor selects *Join a Group*.
2. **Step 1** — Actor declares gender.
3. **Step 2** — System lists groups where `gender = declared gender` AND `enrollment_status = Open`. Actor selects one.
4. **Step 3** — Actor completes the application profile (§9.2).
5. Actor accepts the 30 TND quarterly fee condition.
6. Actor submits.
7. System computes the Applicant Score.
8. System persists the request as `Pending`.
9. System displays a confirmation.

**Alternate 3a:** No matching open group → system shows an empty state; flow ends.
**Alternate 4a:** `Program Goal = Revision` → system blocks submission and states the program is memorization-only.
**Alternate 5a:** Fee condition not accepted → submission disabled.

---

### UC-04 — Manage Join Requests
**Actor:** Assistant

1. Actor opens the join requests page.
2. System lists pending requests for the actor's groups, sorted by Applicant Score descending.
3. Actor opens a request to view the full profile.
4. Actor accepts or rejects.
5. **On accept:** system promotes the applicant to `Student`, binds them to the group, and starts the payment cycle.
6. **On reject:** system sets the request to `Rejected`.

**Business note:** no rejection reason is captured, and the applicant may reapply immediately.

---

### UC-05 — Submit Daily Report
**Actor:** Student · **Precondition:** today is not the group's recitation day and no report exists for today

1. Actor selects *Send Daily Report*.
2. System confirms no report exists for the current date.
3. Actor selects the report type.
4. Actor completes the type-specific fields.
5. Actor submits.
6. System validates (§11) and stores the report immutably.

**Alternate 2a:** Report already exists → system blocks and shows the existing report.
**Alternate 2b:** Today is the recitation day → system redirects to the Weekly Report.
**Alternate 6a:** Validation fails → system highlights the offending fields; nothing is stored.

---

### UC-06 — Submit Weekly Report
**Actor:** Student · **Trigger:** recitation day

1. Actor opens the Weekly Report.
2. System computes all metrics from the week's daily records (§9.6).
3. System displays the metrics read-only.
4. Actor checks or leaves unchecked *I attended the recitation call*.
5. Actor submits.
6. System finalises the report immutably.

**Alternate 5a:** Not submitted by midnight → system finalises with `Attended = No`.

---

### UC-07 — Track Group Performance
**Actor:** Teacher

1. Actor opens a group's performance page.
2. Actor selects a period (default: current week).
3. System aggregates weekly reports across all group members.
4. System renders the group dashboard (§9.4.2).
5. Actor may drill into any student → **UC-08**.

---

### UC-08 — Track Student Performance
**Actor:** Teacher

1. Actor opens a student's performance page.
2. Actor selects a period.
3. System renders the individual dashboard (§9.4.1).
4. Actor may open the raw daily report list for the same period.

---

### UC-09 — Manage Payments
**Actor:** Assistant

1. Actor opens the payments page.
2. System lists students in the actor's groups with derived status and cycle end date.
3. Actor filters by `Unpaid` / `Due Soon` / `Paid`.
4. Actor marks a cycle as paid.
5. System records the payment and advances the cycle by 3 months.

---

### UC-10 — Manage Groups and Staff
**Actor:** Admin

1. Actor creates a group with name, gender, and recitation day.
2. Actor assigns one Teacher and one Assistant.
3. System activates the group with `enrollment_status = Closed` by default.
4. Actor may promote a User to Teacher or Assistant.
5. Actor may remove a Student, which reverts the account to `User` and deletes all associated records.

---

## 7. Business Rules

### 7.1 Membership
- **BR-01** — A User may hold at most one `Pending` join request.
- **BR-02** — A Student belongs to exactly one group.
- **BR-03** — A Student may not apply to another group while enrolled.
- **BR-04** — A removed Student reverts to `User` and may reapply immediately.
- **BR-05** — Removal permanently deletes all daily reports, weekly reports, and payment records for that student. *(See RISK-01.)*
- **BR-06** — A rejected applicant may reapply immediately, with no cooldown and no reason given.

### 7.2 Groups
- **BR-07** — A group has exactly one Teacher and exactly one Assistant.
- **BR-08** — A group is gender-restricted: Men's or Women's.
- **BR-09** — A group has no maximum capacity.
- **BR-10** — Only the Teacher may change enrollment status.
- **BR-11** — Only the Admin may create a group and assign staff.
- **BR-12** — The recitation day is fixed at creation and cannot change.
- **BR-13** — Groups have no scheduled end date.

### 7.3 Weekly schedule
- **BR-14** — Each week contains 6 memorization days and 1 recitation day.
- **BR-15** — The reporting week runs from the day after the recitation day through the following recitation day inclusive.
- **BR-16** — Daily Reports are submitted on memorization days only.
- **BR-17** — The Weekly Report is submitted on the recitation day only.
- **BR-18** — The recitation itself occurs on WhatsApp and is not recorded in the application.

### 7.4 Reporting
- **BR-19** — One Daily Report per student per date.
- **BR-20** — Submission closes at midnight, device-local time.
- **BR-21** — Backdated submission is prohibited.
- **BR-22** — Reports are immutable once submitted.
- **BR-23** — A missing Daily Report counts as one missed occurrence across all applicable weekly metrics.
- **BR-24** — Days marked `Absent — Sick` or `Absent — Studying` are excluded from all weekly calculations.
- **BR-25** — Days marked `Absent — Other` count as a miss.
- **BR-26** — 50 repetitions of the newly memorized portion are required each memorization day. This value is fixed system-wide.
- **BR-27** — During a Revision Period, missed memorization does not count against the student.
- **BR-28** — A Revision Period is implicit: submitting Revision-type reports signals it. No declaration or approval step exists.
- **BR-29** — A Revision Period ends implicitly when the student resumes Normal reports.
- **BR-30** — `Attended Recitation Call` is self-declared and unverified.

### 7.5 Payments
- **BR-31** — The fee is fixed at 30 TND per 3-month cycle, identical for every student.
- **BR-32** — The first cycle starts on the date of join acceptance.
- **BR-33** — Status becomes `Due Soon` 10 days before cycle end.
- **BR-34** — Only the Assistant may record a payment.
- **BR-35** — Payment is tracked, never processed.

### 7.6 Applications
- **BR-36** — Only applicants whose Program Goal is `Memorization` may apply. Revision-only applicants are rejected at form level.
- **BR-37** — Agreement to the fee is mandatory.
- **BR-38** — The Applicant Score is computed automatically and is not editable.

---

## 8. Entity Relationships

### 8.1 ER diagram (textual)

```
                          ┌──────────────┐
                          │    USER      │
                          │──────────────│
                          │ id (PK)      │
                          │ email        │
                          │ password_hash│
                          │ role         │
                          │ group_id (FK)│◄──────┐
                          │ joined_at    │       │
                          └──────┬───────┘       │
                                 │               │
          ┌──────────────────────┼───────────┐   │
          │ 1                    │ 1         │ 1 │
          ▼ 0..N                 ▼ 0..N      ▼ 0..N
   ┌─────────────┐      ┌──────────────┐  ┌──────────┐
   │ JOIN_REQUEST│      │ DAILY_REPORT │  │ PAYMENT  │
   │─────────────│      │──────────────│  │──────────│
   │ id (PK)     │      │ id (PK)      │  │ id (PK)  │
   │ user_id (FK)│      │ student_id FK│  │student FK│
   │ group_id(FK)│      │ report_date  │  │cycle_start│
   │ full_name   │      │ type         │  │cycle_end │
   │ gender      │      │ ...          │  │ status   │
   │ age         │      └──────────────┘  │ paid_at  │
   │ phone       │             │          │ paid_by  │
   │ occupation  │             │ N        └──────────┘
   │ city        │             ▼ 1
   │ hizb_count  │      ┌──────────────┐
   │ tajweed_lvl │      │ WEEKLY_REPORT│
   │ theory_yn   │      │──────────────│
   │ qalun_yn    │      │ id (PK)      │
   │ fee_agreed  │      │ student_id FK│
   │ goal        │      │ week_start   │
   │ score       │      │ week_end     │
   │ status      │      │ attended_call│
   │ created_at  │      │ metrics...   │
   └──────┬──────┘      └──────────────┘
          │ N
          ▼ 1
   ┌───────────────────┐
   │      GROUP        │
   │───────────────────│
   │ id (PK)           │
   │ name              │
   │ gender            │
   │ recitation_day    │
   │ enrollment_status │
   │ teacher_id (FK)   │──▶ USER (role=Teacher)
   │ assistant_id (FK) │──▶ USER (role=Assistant)
   │ created_by (FK)   │──▶ USER (role=Admin)
   └───────────────────┘
```

### 8.2 Relationship summary

| From | Cardinality | To | Notes |
|---|---|---|---|
| User | 1 → 0..N | JoinRequest | Max one with status `Pending` |
| User (Student) | N → 1 | Group | Null while role = User |
| Group | 1 → 1 | Teacher | Mandatory |
| Group | 1 → 1 | Assistant | Mandatory |
| Student | 1 → 0..N | DailyReport | One per date maximum |
| Student | 1 → 0..N | WeeklyReport | One per reporting week |
| Student | 1 → 0..N | Payment | One record per 3-month cycle |
| WeeklyReport | 1 → 0..7 | DailyReport | Derived, by date range |

### 8.3 Deletion behaviour
Per BR-05, removing a Student triggers a **hard cascade delete** of `DAILY_REPORT`, `WEEKLY_REPORT`, and `PAYMENT` rows for that student, plus their `JOIN_REQUEST` history. The `USER` row survives with `role = User` and `group_id = NULL`.

---

## 9. Data Requirements

### 9.1 User

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | Yes | PK |
| email | String | Yes | Unique |
| password_hash | String | Yes | Provider-managed |
| role | Enum | Yes | Admin / User / Student / Teacher / Assistant |
| group_id | UUID | No | Non-null only when role = Student |
| joined_at | Date | No | Set on join acceptance; drives the payment cycle |
| created_at | Timestamp | Yes | |

### 9.2 Join Request

| Field | Type | Required | Constraint |
|---|---|---|---|
| full_name | String | Yes | 3–80 characters |
| gender | Enum | Yes | Male / Female |
| age | Integer | Yes | See OPEN-03 for range |
| phone_number | String | Yes | Tunisian format |
| occupation | String | Yes | |
| city | String | Yes | |
| previous_hizb | Integer | Yes | 1–60 |
| tajweed_level | Enum | Yes | Beginner / Intermediate / Advanced |
| studied_tajweed_theory | Boolean | Yes | |
| studied_qalun | Boolean | Yes | |
| fee_agreement | Boolean | Yes | Must equal `true` |
| program_goal | Enum | Yes | Must equal `Memorization` |
| score | Decimal | Yes | Computed, read-only |
| status | Enum | Yes | Pending / Accepted / Rejected |
| group_id | UUID | Yes | Selected in step 2 |

### 9.3 Applicant Score formula

```
Score = (previous_hizb / 60) × 50
      + TajweedLevel
      + TheoreticalTajweed
      + Qalun

TajweedLevel:        Beginner = 5,  Intermediate = 15, Advanced = 25
TheoreticalTajweed:  Yes = 10,      No = 0
Qalun:               Yes = 15,      No = 0

Range: 0.83 → 100
```

Used solely to sort the Assistant's pending-request list. It does not auto-accept or auto-reject.

### 9.4 Performance metrics

#### 9.4.1 Individual student dashboard

| # | Element | Visual | Source |
|---|---|---|---|
| 1 | Commitment Score | Large number + weekly trend line | §9.4.3 |
| 2 | Memorization progress | Ahzab completed + current position | Daily report ranges |
| 3 | Day breakdown | Donut: memorized / revision / absent-excused / absent-other / missed | Daily reports |
| 4 | Repetition quality | Percentage of memorization days meeting the 50-repetition rule | Daily reports |
| 5 | Recitation attendance | Percentage of weeks attended | Weekly reports |
| 6 | Days since last report | Number, highlighted red at ≥ 3 | Daily reports |

#### 9.4.2 Group dashboard

| # | Element | Visual | Purpose |
|---|---|---|---|
| 1 | Group Commitment average | Large number + trend line | Overall health |
| 2 | Student list | Table sorted by Commitment ascending (weakest first) | Direct intervention |
| 3 | At-risk list | Students with no report for ≥ 3 consecutive expected days | Pain point #2 |
| 4 | Absence reasons | Donut across the group | Pattern detection |
| 5 | Submission rate | Percentage of expected reports received | Pain point #1 |

#### 9.4.3 Commitment Score formula

```
Commitment Score = ( SubmissionRate
                   + MemorizationRate
                   + RevisionRate
                   + AttendanceRate ) / 4

SubmissionRate    = reports submitted        / expected days × 100
MemorizationRate  = days with memorization   / expected memorization days × 100
RevisionRate      = days with revision       / expected days × 100
AttendanceRate    = weeks call attended      / weeks elapsed × 100

Excluded from all denominators: days marked Absent — Sick or Absent — Studying.
Excluded from MemorizationRate denominator: days within a Revision Period (BR-27).
Range: 0–100
```

The 50-repetition compliance rate is shown as a **separate quality indicator**, not folded into the Commitment Score, so that consistency and quality remain independently readable.

> Formula pending stakeholder approval — see OPEN-01.

### 9.5 Daily Report

Common fields:

| Field | Type | Required |
|---|---|---|
| student_id | UUID | Yes |
| report_date | Date | Yes — current date only |
| type | Enum | Yes — Normal / Absent / Revision |
| submitted_at | Timestamp | Yes |

**Type = Normal**

| Field | Type | Required |
|---|---|---|
| no_memorization_today | Boolean | Yes |
| memo_from_surah / memo_from_ayah | Int | If not `no_memorization_today` |
| memo_to_surah / memo_to_ayah | Int | If not `no_memorization_today` |
| memo_time_from / memo_time_to | Time | If memorization provided |
| completed_50_repetitions | Boolean | If memorization provided |
| repetitions_in_single_session | Boolean | If `completed_50_repetitions` = true |
| no_revision_today | Boolean | Yes |
| rev_from_surah / rev_from_ayah | Int | If not `no_revision_today` |
| rev_to_surah / rev_to_ayah | Int | If not `no_revision_today` |
| rev_time_from / rev_time_to | Time | If revision provided |
| read_tafsir | Boolean | Yes |

**Type = Absent**

| Field | Type | Required |
|---|---|---|
| absence_reason | Enum | Yes — Sick / Studying / Other |

**Type = Revision**

| Field | Type | Required |
|---|---|---|
| rev_from_surah / rev_from_ayah | Int | Yes |
| rev_to_surah / rev_to_ayah | Int | Yes |

### 9.6 Weekly Report

| Metric | Computation |
|---|---|
| missed_daily_reports | Expected days with no report |
| missed_daily_memorization | Days with no memorization recorded |
| missed_daily_revision | Days with no revision recorded |
| missed_50_repetitions | Memorization days where `completed_50_repetitions = false` |
| missed_single_session | Days where 50 reps were reached but split across sessions |
| attended_recitation_call | Student-declared Boolean; defaults to `false` if unsubmitted |

All metrics exclude `Absent — Sick` and `Absent — Studying` days. `Absent — Other` and missing reports count as misses (BR-23, BR-25).

### 9.7 Payment

| Field | Type | Notes |
|---|---|---|
| student_id | UUID | |
| cycle_start | Date | Join date, or previous cycle end |
| cycle_end | Date | cycle_start + 3 months |
| amount | Decimal | Fixed 30 TND |
| status | Enum | Paid / Due Soon / Unpaid |
| paid_at | Timestamp | Null until recorded |
| recorded_by | UUID | Assistant |

---

## 10. Permission Matrix

**Legend:** C = Create · R = Read · U = Update · D = Delete · A = Approve · — = no access

| Resource | Admin | Teacher | Assistant | Student | User |
|---|---|---|---|---|---|
| Own account | R U | R U | R U | R U | R U |
| Other user accounts | R U | — | — | — | — |
| Role promotion | U | — | — | — | — |
| Group | C R U D | R (own) | R (own) | R (own) | R (open + gender match) |
| Group enrollment toggle | — | U (own) | — | — | — |
| Teacher/Assistant assignment | C U D | — | — | — | — |
| Join Request | R | — | R A (own groups) | — | C R (own) |
| Student membership | C D | — | A | — | — |
| Daily Report | R | R (own groups) | — | C R (own) | — |
| Weekly Report | R | R (own groups) | — | R U* (own) | — |
| Performance dashboards | R | R (own groups) | — | R (own) | — |
| Payment record | R | — | R U (own groups) | R (own) | — |

\* The Student's only Weekly Report write action is the attended-call checkbox, once.

**Notes**
- No role may delete a Daily or Weekly Report. Deletion occurs only as a cascade of student removal (BR-05).
- The Teacher has exactly one write permission in the entire system: the enrollment toggle.
- The Assistant has no visibility into report content or performance data.

---

## 11. Validation Rules

### 11.1 Registration
- **VR-01** — Email must be RFC-5322 valid and unique.
- **VR-02** — Password minimum 8 characters.

### 11.2 Join application
- **VR-03** — All fields in §9.2 are mandatory.
- **VR-04** — `previous_hizb` integer, 1–60 inclusive.
- **VR-05** — `phone_number` must match the Tunisian format.
- **VR-06** — `fee_agreement` must be `true` to enable submission.
- **VR-07** — `program_goal` must be `Memorization`; `Revision` blocks submission with an explanatory message.
- **VR-08** — Selected group's gender must equal the declared gender. Enforced **server-side**, not only by list filtering.
- **VR-09** — Submission blocked if the user already has a `Pending` request or is an active Student.

### 11.3 Daily report
- **VR-10** — `report_date` must equal the server's current date in the device's timezone.
- **VR-11** — Reject if a report already exists for that student and date.
- **VR-12** — Reject if the current day is the group's recitation day.
- **VR-13** — Surah number 1–114; ayah number must be valid for the given surah.
- **VR-14** — The "to" position must be greater than or equal to the "from" position.
- **VR-15** — `memo_time_to` must be later than `memo_time_from`; same for revision times.
- **VR-16** — Memorization time is required when a memorized portion is provided, and forbidden otherwise.
- **VR-17** — Revision time is required when a revision portion is provided, and forbidden otherwise.
- **VR-18** — `repetitions_in_single_session` may only be `true` when `completed_50_repetitions` is `true`.
- **VR-19** — `absence_reason` is required when type = `Absent`.
- **VR-20** — Revision range is required when type = `Revision`.

### 11.4 Weekly report
- **VR-21** — Submission permitted only on the group's recitation day.
- **VR-22** — Reject if a weekly report already exists for that student and week.

### 11.5 Group
- **VR-23** — Teacher and Assistant must be assigned at creation and cannot be null.
- **VR-24** — The assigned Teacher must hold role `Teacher`; the assigned Assistant must hold role `Assistant`.
- **VR-25** — `recitation_day` is write-once.

### 11.6 Payment
- **VR-26** — A cycle may be marked paid only once.
- **VR-27** — Only the Assistant of that student's group may record the payment.

---

## 12. Non-Functional Requirements

### 12.1 Platform
- **NFR-01** — Native or cross-platform mobile application for Android and iOS.
- **NFR-02** — The application requires an active internet connection. No offline mode, no local queueing (DEC-026).

### 12.2 Localisation
- **NFR-03** — Arabic only.
- **NFR-04** — Full right-to-left layout across every screen, including charts and tables.
- **NFR-05** — Surah names displayed in Arabic.

### 12.3 Security
- **NFR-06** — Passwords stored hashed; managed by the authentication provider.
- **NFR-07** — All traffic over HTTPS.
- **NFR-08** — Server-side authorisation on every endpoint. UI-level hiding is never the sole control.
- **NFR-09** — A Teacher's data access is scoped to their assigned groups; an Assistant's to their assigned groups.
- **NFR-10** — Personal data (phone, age, occupation, city) is visible only to the Assistant reviewing the request and to the Admin.

### 12.4 Performance
- **NFR-11** — Dashboard render under 3 seconds on a 3G connection.
- **NFR-12** — Weekly report computation under 2 seconds.
- **NFR-13** — The system must support the center's current student population with headroom for growth. *See OPEN-04.*

### 12.5 Usability
- **NFR-14** — Daily report submission must be completable in under 60 seconds. This directly determines whether the 80% submission target is achievable.
- **NFR-15** — Charts must be readable on a phone screen without zooming.

### 12.6 Data
- **NFR-16** — Timestamps stored in UTC; day boundaries evaluated in the device's local timezone.
- **NFR-17** — Daily and weekly report records are append-only.

---

## 13. MVP Acceptance Criteria

### 13.1 Primary success metric
> **80% of enrolled students submit a Daily Report 6 days a week for 4 consecutive weeks.**

Measured from production data 4 weeks after launch.

### 13.2 Functional acceptance

| # | Criterion | Verifies |
|---|---|---|
| AC-01 | The seeded Admin can log in and create a group with a Teacher and an Assistant. | FR-GRP |
| AC-02 | A new user registers with email/password and lands on the User dashboard. | FR-AUTH |
| AC-03 | A male applicant sees only open men's groups; a female applicant only open women's groups. | FR-JOIN-03 |
| AC-04 | A join request with `Program Goal = Revision` cannot be submitted. | VR-07 |
| AC-05 | The Assistant's pending list is sorted by Applicant Score, highest first, matching the §9.3 formula. | FR-REQ-02 |
| AC-06 | On acceptance, the applicant's role changes to Student, group binding is created, and the payment cycle starts. | FR-REQ-05 |
| AC-07 | A Student submits one Daily Report; a second attempt for the same date is rejected. | VR-11 |
| AC-08 | Submission for yesterday's date is rejected. | VR-10 |
| AC-09 | A submitted report exposes no edit or delete action. | FR-DR-04 |
| AC-10 | Daily Report submission is blocked on the group's recitation day. | VR-12 |
| AC-11 | On the recitation day, the Weekly Report displays correct metrics computed from that week's daily reports. | FR-WR-01 |
| AC-12 | An unsubmitted Weekly Report finalises at midnight with `attended = No`. | FR-WR-06 |
| AC-13 | Days marked Sick or Studying are excluded from weekly metrics; Other is counted as a miss. | BR-24, BR-25 |
| AC-14 | A student in a Revision Period is not penalised for missed memorization. | BR-27 |
| AC-15 | The Teacher's group dashboard lists students weakest-first and flags those inactive ≥ 3 days. | FR-PERF-01 |
| AC-16 | The Teacher can filter every dashboard by Week / Month / 3 Months / Custom. | FR-PERF-03 |
| AC-17 | A Teacher receives an authorisation error when requesting a group they are not assigned to. | NFR-09 |
| AC-18 | The Assistant marks a payment paid; the Student sees the updated status and next due date. | FR-PAY-05, FR-PAY-07 |
| AC-19 | Payment status flips to `Due Soon` exactly 10 days before cycle end. | FR-PAY-04 |
| AC-20 | Removing a Student reverts the account to User and permanently deletes all their reports and payments. | BR-05 |
| AC-21 | A removed student can immediately submit a new join request. | BR-04 |
| AC-22 | Every screen renders correctly right-to-left in Arabic. | NFR-04 |

---

## 14. Future Improvements

Deferred by explicit decision or identified as gaps during discovery.

| # | Item | Reason deferred |
|---|---|---|
| FI-01 | Online payment processing | Out of MVP scope; currently a manual tracker |
| FI-02 | Push notifications and daily submission reminders | Deferred (DEC-024). **Recommended first addition** — directly serves the primary success metric and pain point #2 |
| FI-03 | Offline report drafting with sync | Deferred (DEC-026). Relevant given a midnight cutoff and unreliable connectivity |
| FI-04 | Soft delete / archival instead of hard delete | Would preserve center history when students leave |
| FI-05 | Teacher write actions — evaluation, correction, comments | Teacher is read-only in MVP |
| FI-06 | In-app recitation session logging | Currently on WhatsApp |
| FI-07 | Formal Revision Period lifecycle with declaration and pass/fail | Currently implicit and unverified |
| FI-08 | Automatic hizb-boundary detection from report ranges | Enables true progress tracking against the Quran |
| FI-09 | Multi-center / multi-branch support | Single center only |
| FI-10 | Group capacity limits and waitlists | No cap in MVP |
| FI-11 | Multiple Admins with an audit trail | Single seeded Admin |
| FI-12 | Rejection reasons and applicant feedback | Not captured |
| FI-13 | Cancel-own-pending-request | Not permitted in MVP |
| FI-14 | Configurable repetition target per group | Fixed at 50 |
| FI-15 | Additional languages (French, English) | Arabic only |
| FI-16 | Student-to-student or teacher-to-student messaging | Not requested |

---

## 15. Open Items and Risks

These require a decision before development starts. None were assumed.

| ID | Item | Impact |
|---|---|---|
| **OPEN-01** | Approve the Commitment Score formula (§9.4.3) and the dashboard element lists (§9.4.1, §9.4.2). | Defines the core screens for pain point #1 |
| **OPEN-02** | Gender is stored on the Join Request, not the User profile. A reapplying user may declare a different gender, and nothing prevents it. Accept, or persist gender to the User on first application? | Data integrity |
| **OPEN-03** | Minimum and maximum age for applicants is undefined. | Blocks VR-04 implementation |
| **OPEN-04** | Expected number of concurrent students and groups is unknown. | Blocks NFR-13 sizing |
| **OPEN-05** | Group archival: BR-13 says groups never end, yet the Admin can "close" a group. Is there an Active/Archived state distinct from the enrollment toggle? | Group lifecycle |
| **OPEN-06** | Does the Assistant see performance data, or only join requests and payments? Assumed **no** in §10. | Permission matrix |
| **OPEN-07** | Is a Weekly Report generated for a student who submitted zero daily reports that week? Assumed **yes**, all metrics counted as missed. | Weekly report edge case |
| **OPEN-08** | What does a Student see between submitting a request and being accepted — only status, or also the group details? | User dashboard |

### Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| **RISK-01** | Hard-deleting reports on student removal permanently destroys the memorization history the system exists to preserve (pain point #1). A student who quits and rejoins restarts from zero, and the center loses all record of them. | **High** | Reconsider FI-04 (soft delete). Same user-facing behaviour, recoverable data. |
| **RISK-02** | No notifications plus a hard midnight cutoff plus no backdating means a student who forgets is permanently penalised, with nothing prompting them. This works directly against the 80% target. | **High** | Reconsider FI-02 for the MVP. |
| **RISK-03** | `Attended Recitation Call` and all report content are self-declared and unverifiable. Performance data reflects what students claim, not what occurred. | Medium | Accept for MVP; note the limitation to the Teacher in the UI. |
| **RISK-04** | Revision Periods are inferred from report type alone. A student can avoid memorization penalties indefinitely by submitting Revision reports. | Medium | Consider a cap on consecutive revision days, or Teacher visibility of revision streaks. |
| **RISK-05** | No connectivity fallback in a context where WhatsApp is the recitation channel, implying variable network conditions. | Medium | Revisit FI-03. |

---

*End of document.*