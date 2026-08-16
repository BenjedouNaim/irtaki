# Irtaki — Technical Specification

## 1. Document Information

| | |
|---|---|
| Document | Technical Specification |
| Pipeline position | 10 of 15 — bridges System Architecture (07), API Specification (08), UX/UI Specification (09) into an implementation-ready blueprint |
| Status | Draft v0.1 — pending final sign-off after Open Technical Questions (§50) |
| Audience | Developers implementing Irtaki; no prior context assumed beyond this document and its inputs |
| Author role | Senior Software Architect / Technical Lead / Implementation Specification Engineer |
| Scope | MVP only, per SAS §31 |

## 2. Purpose

This document answers one question: **how exactly should the already-approved Irtaki system be implemented?** It does not redesign the business, the domain, the database, the API, or the UX — it translates six already-baselined documents into project structure, module layout, layer-by-layer implementation rules, security enforcement points, testing taxonomy, and a build sequence a developer can start from without inventing a business rule.

## 3. Authoritative Inputs

| Document | Role | Status |
|---|---|---|
| SRS.md | Software Requirements Specification | Baselined |
| SAS.md | System Analysis Specification (32 sections, RTM, ADR-001…012) | Baselined |
| DMS.md | Domain Model Specification (entities, VOs, invariants, lifecycles) | Baselined |
| DBD.md | Database Design Specification (18 tables, full constraint/index/ERD set) | Baselined |
| SA.md | System Architecture Specification (ADR-013…039) | Baselined |
| APIS.md | API Specification (54 endpoints, API-001…054) | Baselined |
| UF.md | UX/UI & User Flow Specification (44 sections) | Baselined |

This document introduces no new business rule, domain relationship, role permission, or calculation. Where it makes a decision, that decision is scoped strictly to *how* something already decided gets built — project layout, tooling, conventions — and is logged in §7.

## 4. Document Reconciliation (carried forward)

Full topic-by-topic reconciliation was performed before this document was started. Summary of outcomes:

| Finding | Resolution |
|---|---|
| All core business/domain/API/UX decisions are mutually consistent across all six documents | No further reconciliation needed |
| ⚠️ CONFLICT: `groups.name` uniqueness — DBD §22.1/§34 still text-states "Recommended, not Confirmed" (DB-UQ-11), while APIS §15 (APIQ-05) confirms it enforced with `409` on duplicate | **Resolved (TSQ-01):** APIQ-05 is authoritative — later, more specific decision. Implemented as a real DB `UNIQUE` constraint in §17. DBD.md carries a documentation debt (§44) to update its own text; no re-decision needed. |
| `dashboard_route` field (APIQ-NEW-02) | **Resolved (TSQ-02):** dropped. Mobile routes from `role` alone (UF §9). |
| Arabic collation for name sorting (APIQ-NEW-01) | **Resolved (TSQ-03):** `ar_TN`/ICU collation on relevant indexes — §18. |
| `GET /groups/available` response shape (UXQ-OPEN-07) | **Resolved (TSQ-04):** `{id, name, recitation_day}`, confirmed. |
| `read_tafsir` (ISS-12) | **Resolved (TSQ-05):** informational only — no metric, no index. |
| Repository structure | **Resolved (TSQ-06):** monorepo — §36. |
| Testing framework | **Resolved (TSQ-07):** Jest+Supertest (backend), Jest+RNTL (mobile) — §34. |
| Git branching model | **Resolved (TSQ-08):** trunk-based — §38. |
| Dev seed-data scope | **Resolved (TSQ-09):** §41. |
| ⚠️ **Quran riwaya (VER-01 / TSQ-10)** | **Not yet confirmed.** Provisionally assumed **Hafs ʿan ʿĀṣim** (286 ayat in Al-Baqara) as the overwhelmingly common default, but this is a genuine data-correctness gate, not a safe default to build on silently. Flagged as **BLOCKING for Phase 20 only** (§23) — every other phase proceeds unaffected. See §50. |

## 5. Technical Principles

1. **No business logic in the mobile app.** Every rule is authoritative server-side (SA §9, NFR-08); client-side mirroring is UX convenience only.
2. **No business logic in the ORM layer.** TypeORM entities are persistence mappers; domain services are framework-free (SA §12, §36 Domain Protection).
3. **Scope-filtering is doubled, never single-layered.** Guard-level check for single-resource routes, repository-level filter for list routes (SA §14, NFR-19).
4. **Nothing invented beyond what SA/APIS/DBD/UF already decided.** Where this document must make a call SA left open (project structure, test framework, git flow), it is logged as a Technical Decision (§7), not silently assumed.
5. **Simplicity is the default, not an exception.** No queue, no cache layer, no second service, no vault — unless a specific Irtaki requirement forces it. Matches SA's own Rule 3/Rule 5 posture, carried forward unchanged.
6. **Every layer is a straight line to a requirement.** Requirement → Use Case → Domain → API → UX → Technical Implementation (§48 makes this explicit, end to end).

## 6. Technology Stack

All entries below restate SA §36 ADR-013…039 plus this document's own TSQ-06/07/08 resolutions. Nothing here is a fresh stack decision.

### 6.1 Mobile

| Concern | Choice | Source |
|---|---|---|
| Framework | React Native + Expo (managed workflow) | ADR-017 |
| Language | TypeScript | ADR-017 |
| Navigation | React Navigation (native-stack + role-based root switch) | SA §9 |
| Server state | TanStack Query | ADR-025 |
| Local/session state | Zustand (auth session only) | ADR-025 |
| API client | Typed fetch wrapper with JWT-refresh interceptor | SA §9 |
| Form handling | React Hook Form | New — §7 TD-01 |
| Form validation | `zod` schemas shared between form and API-response shape checks | New — §7 TD-01 |
| Secure storage | Expo SecureStore (refresh token only) | SA §9 |
| Testing | Jest + React Native Testing Library | TSQ-07 |
| Build/release | EAS Build + EAS Submit | SA §27 |

### 6.2 Backend

| Concern | Choice | Source |
|---|---|---|
| Language | TypeScript | ADR-013 |
| Framework | NestJS | ADR-013 |
| Architectural style | Modular monolith | ADR-023 |
| ORM | TypeORM | ADR-028 |
| DTO validation | `class-validator` + `class-transformer` (Nest's native `ValidationPipe`) | New — §7 TD-02 |
| Authentication | In-house argon2id password hashing, JWT access + rotating refresh tokens | ADR-018 |
| Authorization | Custom `RolesGuard` + `ScopeGuard` | SA §14 |
| Scheduler | In-process cron via `@nestjs/schedule`, no broker | ADR-024 |
| Domain events | In-process `EventEmitter2`, post-commit, fire-and-forget | ADR-026, ADR-032 |
| Testing | Jest + Supertest | TSQ-07 |

### 6.3 Database

| Concern | Choice | Source |
|---|---|---|
| DBMS | PostgreSQL | DBD §2 |
| Primary keys | UUIDv7 (15 of 18 tables); natural keys for static reference tables | DBQ-08 |
| Migrations | TypeORM migration files, hand-reviewed (never `synchronize: true`) | New — §7 TD-03, formalizes ADR-028 |
| Extensions | None beyond core PostgreSQL (no `pgcrypto`/`uuid-ossp` needed if UUIDv7 generated app-side — see §17) | New — §7 TD-04 |

### 6.4 Infrastructure

| Concern | Choice | Source |
|---|---|---|
| Hosting | 2× self-managed Tunisian VPS | ADR-014, ADR-035 |
| Deployment platform | Coolify (Traefik + auto Let's Encrypt TLS) | ADR-015 |
| Backup target | Self-hosted MinIO on VPS #2 | ADR-016, ADR-034 |
| Email | Mailgun | ADR-019 |
| Push | FCM via Expo | ADR-020 |
| API protocol | REST/JSON, URI-versioned `/api/v1/...` | ADR-021, APIQ-06 |
| Environments | Dev + Production + PR previews via Coolify | ADR-022, ADR-036 |
| CI | GitHub Actions (lint, test) | SA §27 |
| CD | Coolify webhook on merge to `main` (backend); EAS Build+Submit on release tag (mobile) | SA §27 |
| Secrets | Coolify's built-in encrypted env-var store | ADR-037 |
| Observability | Structured logs + `correlationId` + Healthchecks.io | ADR-033 |

## 7. Technical Decision Register (Phase-10-specific)

These are decisions this document introduces because no upstream document addressed them. Every one is a build-convention choice, not a business or architectural decision — none contradicts or overrides SA/APIS/DBD/UF.

| ID | Decision | Reason | Alternatives considered | Impact |
|---|---|---|---|---|
| TD-01 | React Hook Form + `zod` for mobile forms | Nest/TypeORM ecosystem already leans on schema-first validation; `zod` schemas can be shared (in principle) between form validation and lightweight response-shape sanity checks | Formik+Yup; uncontrolled inputs + manual validation | Consistent form pattern across all 6+ multi-field forms (join application, daily report ×3 types, group create, staff reassignment) |
| TD-02 | `class-validator`/`class-transformer` for backend DTOs | Nest's native validation pipe integrates with decorators already idiomatic in a Nest codebase; zero extra wiring | Manual validation functions; `zod` on the backend too | One validation idiom per layer, matching each framework's own convention rather than forcing a single library across both |
| TD-03 | TypeORM migrations, hand-authored/reviewed, `synchronize: false` always | `synchronize: true` is unsafe outside local dev and has no place in a codebase with immutability triggers and partial unique indexes that must be reviewed, not auto-generated blindly | Auto-sync in all environments; a separate migration tool (Flyway, node-pg-migrate) | Migrations reviewed in PR like any other code change; §40 |
| TD-04 | UUIDv7 generated application-side (`uuidv7` npm package), not a Postgres extension | Keeps ID generation logic testable in the domain/application layer without a DB round-trip; avoids depending on `pg_uuidv7` extension availability on the self-hosted VPS Postgres build | `uuid-ossp` + DB-side `gen_random_uuid()`; `pgcrypto` | One less DB extension to provision on Coolify-managed Postgres |
| TD-05 | Monorepo (TSQ-06) | Matches SA §27's single-GitHub-repo deploy diagram; one PR can span an API contract change on both sides | Two repos (`irtaki-backend`, `irtaki-mobile`) | §36 |
| TD-06 | Jest+Supertest / Jest+RNTL (TSQ-07) | Nest's own scaffolding default; RNTL is Expo's documented pairing | Vitest; Detox for mobile E2E (deferred, not MVP-justified) | §34 |
| TD-07 | Trunk-based git flow (TSQ-08) | Matches deploy-on-merge-to-`main`; a `develop` branch has no environment to point at | GitFlow with `develop` + release branches | §38 |

## 8. System Boundaries

```
Mobile App (React Native + Expo)
     │  HTTPS/REST, JWT bearer
     ▼
API — NestJS Presentation Layer (Controllers, Guards, Pipes)
     │
     ▼
Application Layer (Use-case services — orchestration, transaction ownership)
     │
     ▼
Domain Layer (Entities, Value Objects, Domain Services — framework-free)
     │
     ▼
Infrastructure Layer (TypeORM repositories, mappers)
     │
     ▼
PostgreSQL
```

| Boundary | Rule |
|---|---|
| Mobile → API | Mobile talks **only** to the typed API client; no direct DB access, no business logic beyond UX convenience mirrors (SA §9) |
| Presentation → Application | Controllers call use-case services only; controllers never touch a repository directly |
| Application → Domain | Use-case services orchestrate domain entities/services; they own transaction boundaries (ADR-028) |
| Domain → Infrastructure | **Forbidden.** Domain entities and domain services import nothing from TypeORM, Nest, or any I/O library (SA §36, "Domain Protection") |
| Infrastructure → Domain | Repository implementations map ORM entities to domain entities via dedicated Mappers — the domain never sees a TypeORM decorator |
| Any layer → external services (Mailgun, FCM) | Only Infrastructure adapters; Application layer calls an interface, never the vendor SDK directly |

This mirrors SA §12's Domain/Application/Infrastructure boundary matrix exactly — this document does not redraw it, only makes it concrete per module (§11) and per use case (§12).

## 9. Backend Architecture

Four layers, applied uniformly across all 10 modules from SA §11:

| Layer | Responsibility | Allowed dependencies | Forbidden dependencies | Example |
|---|---|---|---|---|
| **Presentation** | HTTP routing, DTO shape validation, auth/authz guard invocation, response formatting | Application layer, `class-validator` DTOs | Domain internals, repositories, TypeORM | `DailyReportsController` |
| **Application** | Use-case orchestration, transaction ownership, cross-module coordination via events | Domain layer, repository interfaces, `EventEmitter2` | Nothing HTTP-specific (no `Request`/`Response` objects) | `SubmitDailyReportUseCase` |
| **Domain** | Entities, value objects, invariants, domain services | Nothing outside the domain package | TypeORM, Nest, HTTP, any I/O | `DailyReport` entity, `CommitmentScoreCalculator` domain service |
| **Infrastructure** | Repository implementations, ORM entities/mappers, external adapters (Mailgun, FCM, Healthchecks.io) | Domain interfaces (implements them), TypeORM, vendor SDKs | Business rules | `TypeOrmDailyReportRepository` |

Each of the 10 SA §11 modules (Identity, Groups, Enrollment, Memberships, Reports, Progress, Performance, Payments, Notifications, Administration) is a NestJS module with this four-layer internal shape. Module-to-module calls follow SA §11's directed graph exactly — solid edges are direct calls (Enrollment → Memberships on acceptance), dashed edges are event subscriptions (Performance/Notifications/Administration never called into directly, per ADR-026).

## 10. Mobile Architecture

```
Presentation (screens, per SA §9's role-based navigator)
     │
     ▼
Application (feature hooks — one per screen/flow, wraps TanStack Query + form state)
     │
     ▼
Data (typed API client with JWT-refresh interceptor; Zustand auth store; SecureStore)
```

No client-side domain layer exists — SA §9 is explicit that every business rule is server-authoritative; this document does not introduce one. Feature hooks are the only place TanStack Query and form state (React Hook Form, per TD-01) are composed together; screens consume hooks, never call the API client directly.

| State category | Owner | Persistence |
|---|---|---|
| Server state (groups, reports, performance, payments) | TanStack Query cache | In-memory only, per ADR-025 — no persisted offline cache (NFR-02) |
| Auth session (access token in memory, refresh token) | Zustand store + SecureStore | Refresh token persisted in SecureStore; access token in memory, re-fetched via refresh on cold start |
| Form state (join application, daily report, group create) | React Hook Form, local to the screen/feature | None — lost on navigation away, matching UF §25's confirmation-pattern posture (no draft persistence, no offline drafting) |
| UI-only state (bottom-sheet open/closed, wizard step) | `useState`/`useReducer`, local to component | None |

Detailed per-screen feature module layout is in §36 (Project Structure) and §24 (Mobile Feature Structure is folded into §36 rather than a separate top-level section, since the two are identical content for this project's scale).

## 11. Domain Modules

One NestJS module per SA §11 module, each wrapping the domain services (DS-01…08) and entities (E-01…12) that already exist in DMS. This section adds nothing new — it is the implementation address for each already-specified piece.

| Module | Entities owned (DMS) | Value objects used | Domain services | Commands (write) | Queries (read) | Depends on |
|---|---|---|---|---|---|---|
| **Identity** | E-01 User | — | — | Register, Login, RefreshSession, Logout, RequestPasswordReset, ConfirmPasswordReset, UpdateProfile, PromoteRole | GetOwnProfile | none (leaf) |
| **Groups** | E-02 Group | — | DS-07 GroupArchivalService, DS-08 GroupStaffReassignmentService | CreateGroup, RenameGroup, ToggleEnrollment, ReassignStaff, ArchiveGroup, UnarchiveGroup, DeleteGroup | ListGroups, GetAvailableGroups, GetGroupDetail | Identity |
| **Enrollment** | E-04 JoinRequest, embedded VO-08 ApplicantProfile | VO-08 | DS-01 EnrollmentService (shared with Memberships) | SubmitJoinRequest, AcceptJoinRequest, RejectJoinRequest | ListOwnJoinRequest, ListReviewQueue, GetJoinRequestDetail | Groups, Memberships, Progress |
| **Memberships** | E-03 Membership | — | DS-01 (creation half) | TerminateMembership | GetOwnMembership, GetRoster, GetRecoveryView | Reports, Payments, Progress (cascade targets) |
| **Reports** | E-05 DailyReport, E-06 WeeklyReport | VO-02 AyahRange, VO-03 TimeWindow, VO-04 ReportingWeek, VO-09 DayClassification | DS-02 WeeklyReportFinalizationService | SubmitDailyReport, ConfirmWeeklyReport | GetTodayReportStatus, ListOwnDailyReports, ListRosterDailyReports, GetCurrentWeeklyReport, ListOwnWeeklyReports, ListRosterWeeklyReports | — (emits DE-05/06/07) |
| **Progress** | E-08 MemorizationCoverage, external Surah/HizbBoundary reference | VO-01 AyahPosition, VO-02 AyahRange, VO-07 CoverageSet | DS-05 MemorizationProgressEngine | (internal only — reacts to DE-05) | GetOwnProgress, GetMembershipProgress, ListSurahs, ListHizbBoundaries | — (subscribes to Reports) |
| **Performance** | *(owns no table — pure derivation)* | VO-06 CommitmentScore | DS-03 CommitmentScoreCalculator, DS-04 AtRiskDetectionService | — | GetOwnPerformance, GetGroupPerformance, GetMembershipPerformance, GetAtRiskList | Reports, Memberships, Progress (read-only) |
| **Payments** | E-07 PaymentRecord | VO-05 PaymentCycle | DS-06 PaymentCycleDerivationService | RecordPaymentCycle | GetOwnPaymentLedger, GetGroupPaymentLedger | Memberships |
| **Notifications** | E-09 DeviceToken, E-10 NotificationPreference, E-11 NotificationLog | — | — | RegisterDevice, UnregisterDevice, SetNotificationPreference | GetNotificationPreferences | subscribes to DE-01…12; evaluates DE-13/14/15 on schedule |
| **Administration** | E-12 AuditEntry | — | — | *(none — write path is internal, triggered by audited actions in other modules)* | ListUsers, GetAuditLog | subscribes to 3 audited events (payment recorded, student removed, role promotion) |

## 12. Application Use Cases

Every SRS/SAS use case (UC-01…18) maps to one or more application-layer use-case services. Table below is the authoritative mapping for implementation — one file per row in the module's `application/` folder (§36).

| Use Case | Application Operation(s) | Actor | Module |
|---|---|---|---|
| UC-01 Register and Log In | `RegisterUseCase`, `LoginUseCase`, `RefreshSessionUseCase`, `LogoutUseCase` | Anonymous → Any | Identity |
| UC-02 See Dashboard | `GetDashboardUseCase` (composes Performance/Progress/Payments reads behind one call — APIQ-01) | Any authenticated | cross-module orchestrator, no owning module |
| UC-03 Apply to Join a Group | `SubmitJoinRequestUseCase` | User | Enrollment |
| UC-04 Manage Join Requests | `ListReviewQueueUseCase`, `AcceptJoinRequestUseCase`, `RejectJoinRequestUseCase` | Assistant | Enrollment (Accept calls into Memberships/Progress transactionally — ADR-028) |
| UC-05 Submit Daily Report | `SubmitDailyReportUseCase` | Student | Reports |
| UC-06 Submit Weekly Report | `ConfirmWeeklyReportUseCase`, `GetCurrentWeeklyReportUseCase` | Student | Reports |
| UC-07 Track Group Performance | `GetGroupPerformanceUseCase`, `GetAtRiskListUseCase` | Teacher | Performance |
| UC-08 Track Student Performance | `GetOwnPerformanceUseCase`, `GetMembershipPerformanceUseCase` | Student, Teacher | Performance |
| UC-09 Manage Payments | `RecordPaymentCycleUseCase`, `GetPaymentLedgerUseCase` | Assistant, Student | Payments |
| UC-10 Manage Groups and Staff | `CreateGroupUseCase`, `UpdateGroupUseCase`, `ToggleEnrollmentUseCase` | Admin, Teacher | Groups |
| UC-11 Reassign Group Staff | `ReassignStaffUseCase` | Admin | Groups |
| UC-12 Remove a Student | `TerminateMembershipUseCase` | Admin | Memberships (cascades DE-09 to Reports/Payments/Progress) |
| UC-13 Archive / Un-archive a Group | `ArchiveGroupUseCase`, `UnarchiveGroupUseCase` | Admin | Groups (DS-07) |
| UC-14 Toggle Group Enrollment | `ToggleEnrollmentUseCase` | Teacher | Groups |
| UC-15 Dispatch Daily Reminder | *(scheduler-only — no HTTP use case; see §19)* | System | Notifications |
| UC-16 Recover Removed Student Data | `GetRecoveryViewUseCase` | Admin | Memberships |
| UC-17 Promote a User to Staff | `PromoteRoleUseCase` | Admin | Identity |
| UC-18 Manage Notification Preferences | `SetNotificationPreferenceUseCase`, `GetNotificationPreferencesUseCase` | Any | Notifications |

## 13. API Implementation Mapping

All 54 endpoints (APIS §8) map 1:1 to a controller action → use-case call. Full table below; DTOs follow the naming convention in §37.

| Endpoint | Controller · action | Application Operation | Input DTO | Output DTO |
|---|---|---|---|---|
| `POST /auth/register` | `AuthController.register` | `RegisterUseCase` | `RegisterRequestDto` | `AuthResponseDto` |
| `POST /auth/login` | `AuthController.login` | `LoginUseCase` | `LoginRequestDto` | `AuthResponseDto` |
| `POST /auth/refresh` | `AuthController.refresh` | `RefreshSessionUseCase` | `RefreshRequestDto` | `AuthResponseDto` |
| `POST /auth/logout` | `AuthController.logout` | `LogoutUseCase` | — | `204` |
| `POST /auth/password-reset/request` | `AuthController.requestReset` | `RequestPasswordResetUseCase` | `RequestResetDto` | `202` |
| `POST /auth/password-reset/confirm` | `AuthController.confirmReset` | `ConfirmPasswordResetUseCase` | `ConfirmResetDto` | `204` |
| `GET /me` | `MeController.getProfile` | `GetOwnProfileUseCase` | — | `ProfileResponseDto` |
| `PATCH /me` | `MeController.updateProfile` | `UpdateProfileUseCase` | `UpdateProfileDto` | `ProfileResponseDto` |
| `GET /me/dashboard` | `DashboardController.get` | `GetDashboardUseCase` | — | `DashboardResponseDto` (per-role `oneOf`) |
| `GET /groups` | `GroupsController.list` | `ListGroupsUseCase` | query params | `GroupListItemDto[]` |
| `GET /groups/available` | `GroupsController.listAvailable` | `GetAvailableGroupsUseCase` | `gender` query | `AvailableGroupDto[]` — `{id, name, recitation_day}` (TSQ-04) |
| `GET /groups/{id}` | `GroupsController.getOne` | `GetGroupDetailUseCase` | path id | `GroupDetailDto` |
| `POST /groups` | `GroupsController.create` | `CreateGroupUseCase` | `CreateGroupDto` | `GroupDetailDto` |
| `PATCH /groups/{id}` | `GroupsController.update` | `UpdateGroupUseCase` | `UpdateGroupDto` | `GroupDetailDto` |
| `PATCH /groups/{id}/enrollment` | `GroupsController.toggleEnrollment` | `ToggleEnrollmentUseCase` | `ToggleEnrollmentDto` | `GroupDetailDto` |
| `PATCH /groups/{id}/staff` | `GroupsController.reassignStaff` | `ReassignStaffUseCase` | `ReassignStaffDto` | `GroupDetailDto` |
| `PATCH /groups/{id}/lifecycle` | `GroupsController.setLifecycle` | `ArchiveGroupUseCase` / `UnarchiveGroupUseCase` | `SetLifecycleDto` | `GroupDetailDto` |
| `DELETE /groups/{id}` | `GroupsController.delete` | `DeleteGroupUseCase` | — | `204` |
| `POST /join-requests` | `JoinRequestsController.submit` | `SubmitJoinRequestUseCase` | `SubmitJoinRequestDto` | `JoinRequestResponseDto` |
| `GET /join-requests/mine` | `JoinRequestsController.mine` | `GetOwnJoinRequestUseCase` | — | `JoinRequestStatusDto` |
| `GET /join-requests` | `JoinRequestsController.queue` | `ListReviewQueueUseCase` | query params | `JoinRequestListItemDto[]` |
| `GET /join-requests/{id}` | `JoinRequestsController.getOne` | `GetJoinRequestDetailUseCase` | path id | `JoinRequestDetailDto` |
| `POST /join-requests/{id}/accept` | `JoinRequestsController.accept` | `AcceptJoinRequestUseCase` | — | `MembershipDto` |
| `POST /join-requests/{id}/reject` | `JoinRequestsController.reject` | `RejectJoinRequestUseCase` | — | `204` |
| `GET /memberships/mine` | `MembershipsController.mine` | `GetOwnMembershipUseCase` | — | `MembershipDto` |
| `GET /groups/{id}/memberships` | `MembershipsController.roster` | `GetRosterUseCase` | path id | `RosterEntryDto[]` |
| `DELETE /memberships/{id}` | `MembershipsController.terminate` | `TerminateMembershipUseCase` | path id | `204` |
| `GET /memberships/{id}/recovery` | `MembershipsController.recovery` | `GetRecoveryViewUseCase` | path id | `RecoveryViewDto` |
| `GET /daily-reports/today` | `DailyReportsController.today` | `GetTodayReportStatusUseCase` | — | `TodayReportStatusDto` |
| `POST /daily-reports` | `DailyReportsController.submit` | `SubmitDailyReportUseCase` | `SubmitDailyReportDto` (discriminated union: Normal/Absence/Revision) | `DailyReportDto` |
| `GET /daily-reports` | `DailyReportsController.mine` | `ListOwnDailyReportsUseCase` | cursor params | `DailyReportDto[]` |
| `GET /memberships/{id}/daily-reports` | `DailyReportsController.forMembership` | `ListRosterDailyReportsUseCase` | path id, cursor | `DailyReportDto[]` |
| `GET /weekly-reports/current` | `WeeklyReportsController.current` | `GetCurrentWeeklyReportUseCase` | — | `WeeklyReportLiveDto` |
| `POST /weekly-reports/{id}/confirm` | `WeeklyReportsController.confirm` | `ConfirmWeeklyReportUseCase` | path id | `WeeklyReportDto` |
| `GET /weekly-reports` | `WeeklyReportsController.mine` | `ListOwnWeeklyReportsUseCase` | cursor | `WeeklyReportDto[]` |
| `GET /memberships/{id}/weekly-reports` | `WeeklyReportsController.forMembership` | `ListRosterWeeklyReportsUseCase` | path id, cursor | `WeeklyReportDto[]` |
| `GET /me/performance` | `PerformanceController.mine` | `GetOwnPerformanceUseCase` | — | `PerformanceDto` |
| `GET /groups/{id}/performance` | `PerformanceController.forGroup` | `GetGroupPerformanceUseCase` | path id | `GroupPerformanceDto` |
| `GET /memberships/{id}/performance` | `PerformanceController.forMembership` | `GetMembershipPerformanceUseCase` | path id | `PerformanceDto` |
| `GET /groups/{id}/at-risk` | `PerformanceController.atRisk` | `GetAtRiskListUseCase` | path id | `AtRiskEntryDto[]` |
| `GET /me/progress` | `ProgressController.mine` | `GetOwnProgressUseCase` | — | `ProgressDto` |
| `GET /memberships/{id}/progress` | `ProgressController.forMembership` | `GetMembershipProgressUseCase` | path id | `ProgressDto` |
| `GET /quran/surahs` | `QuranController.surahs` | `ListSurahsUseCase` | — | `SurahDto[]` (long cache headers, ADR-031) |
| `GET /quran/hizb-boundaries` | `QuranController.hizbBoundaries` | `ListHizbBoundariesUseCase` | — | `HizbBoundaryDto[]` |
| `GET /me/payments` | `PaymentsController.mine` | `GetOwnPaymentLedgerUseCase` | — | `PaymentLedgerDto` |
| `GET /groups/{id}/payments` | `PaymentsController.forGroup` | `GetGroupPaymentLedgerUseCase` | path id | `PaymentLedgerDto[]` |
| `POST /memberships/{id}/payments` | `PaymentsController.recordPayment` | `RecordPaymentCycleUseCase` | path id, `RecordPaymentDto` | `PaymentRecordDto` |
| `POST /devices` | `NotificationsController.registerDevice` | `RegisterDeviceUseCase` | `RegisterDeviceDto` | `DeviceTokenDto` |
| `DELETE /devices/{id}` | `NotificationsController.unregisterDevice` | `UnregisterDeviceUseCase` | path id | `204` |
| `GET /me/notification-preferences` | `NotificationsController.preferences` | `GetNotificationPreferencesUseCase` | — | `NotificationPreferenceDto[]` |
| `PATCH /me/notification-preferences` | `NotificationsController.setPreference` | `SetNotificationPreferenceUseCase` | `SetPreferenceDto` | `NotificationPreferenceDto` |
| `PATCH /users/{id}/role` | `AdminController.promoteRole` | `PromoteRoleUseCase` | path id, `PromoteRoleDto` | `UserDto` |
| `GET /users` | `AdminController.listUsers` | `ListUsersUseCase` | query params | `UserDto[]` |
| `GET /audit` | `AdminController.auditLog` | `GetAuditLogUseCase` | cursor params | `AuditEntryDto[]` |

This document does not redesign the contract above — it is a restatement of APIS §8/§10 with an implementation address attached to each row.

## 14. Authentication

Restates SA §13 with implementation-level detail. New table `auth_tokens` (DBT-19, versioned delta beyond DBD v1.0's 18 tables — see §17) stores refresh and password-reset tokens hashed, never in plaintext.

| Token | Lifetime | Client storage | Server storage | Rotation |
|---|---|---|---|---|
| Access (JWT) | 1 hour | Memory only (Zustand, never persisted) | Stateless — signature-verified, not looked up | Re-issued on refresh |
| Refresh | 30 days, sliding | Expo SecureStore | `auth_tokens`, SHA-256 hash | Rotated on every use; reuse of a revoked token revokes the entire chain and forces re-login |
| Password reset | 30 minutes, single-use | Emailed deep link (UXQ-OPEN-08) | `auth_tokens`, SHA-256 hash | Single-use; a successful reset revokes every outstanding refresh token for that user |

**Request lifecycle (Phase 9 pattern, applies to every protected endpoint):**

```
Mobile → HTTP Request → AuthGuard (JWT signature+expiry)
       → RolesGuard (role ∈ @Roles(...)?)
       → ScopeGuard (resource ownership check)
       → ValidationPipe (DTO shape/type)
       → Use-Case Service (application layer)
       → Domain Service / Entity (business rules)
       → Repository (scope filter re-applied, NFR-19 backstop)
       → PostgreSQL
       → Response DTO → HTTP Response → Mobile
```

Each stage is explained in its own section: AuthGuard/RolesGuard/ScopeGuard in §15, ValidationPipe in §21, repository scope filter in §16, domain rules in §11/§22–25.

**Mobile-side behavior:**

| Event | Mobile behavior |
|---|---|
| 401 on any request | Silent refresh attempt via `/auth/refresh`; if that also fails, force logout to the login screen — never surface a raw 401 to the user (SA §9's error-mapping table) |
| App cold start | Attempt silent refresh using the stored refresh token before rendering any authenticated screen |
| Logout (explicit) | Call `/auth/logout`, clear SecureStore + Zustand store, navigate to Login |
| Password reset confirm | Deep link opens the app directly to the confirm screen with the reset token pre-filled from the URL |

Nothing here is a new authentication feature — no MFA, no SSO, no social login (ADR-018, Rule 2).

## 15. Authorization

Restates SA §14 exactly. Two independent axes enforced on **every** protected endpoint, never one alone:

1. **RBAC** — `RolesGuard` checks the caller's role against the endpoint's `@Roles(...)` decorator. Coarse: "can this role ever call this endpoint."
2. **Instance-level scope** — `ScopeGuard` checks the caller against the specific resource (`groups.teacher_id`/`assistant_id`, or `memberships.user_id` for a Student's own data). Fine: "can this user act on this specific record."

```
Request → AuthGuard (401 on failure)
        → RolesGuard (403 on failure, uniform with ScopeGuard's 403)
        → ScopeGuard (403 on failure)
        → Controller handler
        → Repository (scope filter re-applied — the list-endpoint backstop)
```

### 15.1 Authorization Matrix

Restated in implementation terms from APIS §6.1 — each row names the Guard configuration, not just the outcome:

| Resource group | `@Roles()` | `ScopeGuard` check | Notes |
|---|---|---|---|
| Groups (write) | Admin | none — Admin bypasses `ScopeGuard` by early-return (DEC-C07) | |
| Groups (`/enrollment` toggle) | Teacher | `groups.teacher_id == caller` | |
| Join Requests (review) | Assistant | `groups.assistant_id == caller` on the request's target group | |
| Memberships (roster, terminate) | Teacher, Assistant, Admin | staff scope; Admin bypass | |
| Daily/Weekly Reports | Student (own), Teacher (assigned group), Admin | `memberships.user_id == caller` OR staff scope | **Assistant excluded entirely — not in `@Roles()` at all** (DEC-B09) |
| Performance | Student (own), Teacher (assigned group), Admin | same as Reports | **Assistant excluded entirely** |
| Payments (read) | Student (own), Assistant (assigned group), Admin | membership/staff scope | **Teacher excluded entirely** |
| Payments (write) | Assistant | `groups.assistant_id == caller` on membership's group | |
| Administration | Admin only | none | |

### 15.2 IDOR Protection (Phase 12)

Every endpoint taking a resource ID in its path is a potential IDOR surface. Defense-in-depth, applied identically everywhere — never relying on a single layer:

| Layer | What it checks | Example |
|---|---|---|
| `ScopeGuard` (single-resource routes) | One indexed lookup before the handler runs: `SELECT 1 FROM groups WHERE id=:id AND (teacher_id=:uid OR assistant_id=:uid)` | `GET /memberships/{id}/performance` — verifies the membership's group is staffed by the caller before the handler executes |
| Repository scope filter (list routes) | Every list query is generated with the caller's scope pre-applied, never post-filtered in application code | `GET /groups/{id}/memberships` — the roster query itself is `WHERE group_id = :id`, and `:id` was already validated by `ScopeGuard` upstream; the repository never trusts the path param alone for a second, independent check would be redundant here, but for *unscoped* list routes like `GET /join-requests` (Assistant's queue) the repository filters `WHERE group_id IN (caller's assigned groups)` since there's no single resource ID to Guard-check |
| Out-of-scope vs. not-found | Identical `403` for both (NFR-20) | A scope-guarded lookup returning zero rows can't distinguish "doesn't exist" from "exists, not yours" — and doesn't need to; both return the same masked response |

**Example — `GET /memberships/{id}/daily-reports` (Teacher requesting a student's report history):**

```
1. AuthGuard: valid JWT → caller = Teacher, user_id = T
2. RolesGuard: Teacher ∈ @Roles('Teacher','Admin') → pass
3. ScopeGuard: SELECT 1 FROM memberships m JOIN groups g ON g.id = m.group_id
               WHERE m.id = :membershipId AND g.teacher_id = :T
               → 0 rows → 403 (caller's own group only, per staff scope)
4. If it had returned 1 row: repository query itself still scopes
               WHERE membership_id = :membershipId — the ID that already
               passed ScopeGuard, never a second, independently-trusted ID
```

No handler in this system trusts a path or body ID without a preceding Guard check or a repository-level scope clause — this is the concrete backstop that satisfies SA §36's "Data Integrity" review line.

## 16. Security

Restates SA §25's threat table with implementation ownership attached.

| Threat | Mitigation | Implemented where |
|---|---|---|
| Credential stuffing | argon2id (~250ms work factor) + rate limiting | `@nestjs/throttler` on `/auth/*` |
| Refresh-token theft | Rotation + reuse detection (chain revocation) | `auth_tokens.replaced_by` chain, Identity module |
| SQL injection | Parameterized queries exclusively | TypeORM's query builder / repository methods only — no raw string concatenation anywhere |
| Mass assignment | DTO allow-lists | `class-validator` DTOs strip unknown fields (`whitelist: true`, `forbidNonWhitelisted: true` on the global `ValidationPipe`) |
| IDOR | Doubled scope check | §15.2 |
| Join-request flooding | Rate limit on `POST /join-requests` (ISS-19) | `@nestjs/throttler`, per-user |
| Seeded Admin credentials | Forced password change on first login (ISS-07) | Identity module, `must_change_password` flag checked post-login |
| Sensitive data exposure | Password hash, refresh-token hashes never serialized | DTO layer excludes these fields structurally — not a runtime redaction step, they're simply absent from every response DTO's shape |
| Server compromise | fail2ban, unattended upgrades, SSH key-only, Traefik as sole exposed surface | Infrastructure — Coolify/VPS provisioning, outside application code |
| MITM | TLS everywhere via automatic Let's Encrypt (Coolify/Traefik) | Infrastructure |
| Backup exposure | MinIO reachable only from VPS #1 | Infrastructure, ADR-034 |
| Personal-data over-exposure | Field-level restriction at the DTO layer | `NFR-10` — e.g., applicant email excluded from `GET /join-requests/{id}` per APIQ-04 |

**Security checklist for every new endpoint (used in code review, §37/§51):**

- [ ] `@Roles(...)` present and correct
- [ ] `ScopeGuard` applied if the route touches a specific resource
- [ ] Repository query scoped, not filtered in application code after fetch
- [ ] Request DTO has `class-validator` decorators on every field, `whitelist: true`
- [ ] Response DTO excludes any field not explicitly required by APIS
- [ ] No raw SQL / string-built queries
- [ ] 403 and 404 are indistinguishable where NFR-20 applies

## 17. Database Implementation

The schema is DBD.md's 18 tables plus one addition surfaced during Architecture (§14): `auth_tokens` (DBT-19). This document does not redesign the ERD — it restates ownership, keys, and the one resolved conflict (TSQ-01).

| Table | Domain Entity | PK strategy | Notes for implementation |
|---|---|---|---|
| `users` (DBT-01) | E-01 User | UUIDv7, app-generated (TD-04) | `password_hash` never selected by default in TypeORM entity (`select: false`) |
| `groups` (DBT-02) | E-02 Group | UUIDv7 | `name` — **`UNIQUE` constraint, DB-level** (TSQ-01 resolves DB-UQ-11 as Confirmed) |
| `memberships` (DBT-03) | E-03 Membership | UUIDv7 | Partial unique `(user_id) WHERE state='Active'` |
| `join_requests` (DBT-04) | E-04 JoinRequest | UUIDv7 | Partial unique `(user_id) WHERE status='Pending'` |
| `join_request_ahzab` (DBT-05) | VO-08 member set | Composite | Cascades with parent |
| `daily_reports` (DBT-06) | E-05 DailyReport | UUIDv7 | Partial unique `(membership_id, report_date) WHERE deleted_at IS NULL`; immutable via trigger |
| `weekly_reports` (DBT-07) | E-06 WeeklyReport | UUIDv7 | Partial unique `(membership_id, week_start)`; immutable-with-exceptions trigger while `Open` |
| `payment_records` (DBT-08) | E-07 PaymentRecord | UUIDv7 | Partial unique `(membership_id, cycle_index)`; fully immutable |
| `memorization_coverage` (DBT-09) | E-08 MemorizationCoverage | UUIDv7 | Strict 1:1 with `memberships` |
| `coverage_intervals` (DBT-10) | VO-07 CoverageSet member | UUIDv7 | Merge-on-insert, owned by DS-05 |
| `surahs` (DBT-11) | Reference | Natural (`number`) | Deployment-loaded, read-only — see §23 for riwaya dependency (TSQ-10, still open) |
| `hizb_boundaries` (DBT-12) | Reference | Natural (`hizb_number`) | Deployment-loaded, read-only |
| `reference_data_version` (DBT-13) | — | Singleton | One row, updated on dataset reload |
| `device_tokens` (DBT-14) | E-09 DeviceToken | UUIDv7 | Physical delete permitted (no history needed) |
| `notification_categories` (DBT-15) | E-10 lookup | Natural (`code`) | Deployment-loaded |
| `notification_preferences` (DBT-16) | E-10 NotificationPreference | UUIDv7 | Unique `(user_id, category)` |
| `notification_log` (DBT-17) | E-11 NotificationLog | UUIDv7 | Write-once, no retention policy (ISS-08, accepted gap) |
| `audit_entries` (DBT-18) | E-12 AuditEntry | UUIDv7 | Write-once, never deleted |
| `auth_tokens` (DBT-19) | *(supporting, Identity module)* | UUID | Hashed tokens only; `replaced_by` self-FK for rotation chain (§14) |

**Unique constraints** — the 10 from DBD §22.1, plus `groups(name)` now Confirmed (TSQ-01), enforced identically: 11 total, all implemented as partial or full unique indexes, never as an application-layer "check then insert" pattern (§20 explains why).

**Check constraints** — all 20 from DBD §22.2 (DB-CHK-01…20) are implemented exactly as specified: single-row `CHECK`s where the rule is self-contained, `BEFORE UPDATE` triggers where it spans a lifecycle state or crosses a table (recitation-day immutability, report immutability, cross-table gender match on join requests). Two rules stay application-level only, per DBD's own Rule 4 classification, and are enforced in the Application layer instead: `recorded_by` must be the currently-assigned Assistant (checked in `RecordPaymentCycleUseCase`), and INV-07's demotion-block (owned by DS-08 `GroupStaffReassignmentService`).

**Soft deletion** — implemented as a `deleted_at` column plus `RESTRICT` (not `CASCADE`) on foreign keys for every table DMS §18.1 marks "Full" history, matching ADR-007 exactly. The two deliberate `CASCADE` exceptions (`join_request_ahzab`, `coverage_intervals`) cascade only because they are child rows with no independent existence outside their parent (DBQ-10). TypeORM's default query scope on every soft-deletable repository excludes `deleted_at IS NOT NULL` rows automatically — the one exception is the Admin recovery query (`GetRecoveryViewUseCase`), which explicitly queries the opposite (`WHERE deleted_at IS NOT NULL`) and is the only code path in the system permitted to do so.

## 18. Database Indexing

All 11 indexes from DBD §23 (DB-IDX-01…11), unchanged, plus the Arabic-collation addition resolved by TSQ-03.

| Index | Serves | Query pattern it answers |
|---|---|---|
| `daily_reports(membership_id, report_date)` | Every weekly/dashboard computation | Date-range scan per membership |
| `weekly_reports(membership_id, week_start)` | AttendanceRate, weekly history | |
| `memberships(group_id, state)` | Group roster and dashboards | |
| `memberships(group_id, started_at, ended_at)` | Period-aware historical aggregation | |
| `join_requests(group_id, status, score DESC, created_at ASC)` | Assistant review queue, pre-sorted | |
| `groups(gender, enrollment_status, lifecycle_state)` | Open-group discovery | |
| `coverage_intervals(coverage_id, start_ordinal)` | Interval merge-on-insert | |
| `payment_records(membership_id, cycle_index)` | Ledger derivation | |
| `notification_preferences(user_id, category)` | Preference lookup at dispatch time | |
| `memberships(user_id) WHERE state='Active'` | "Current group" lookup — doubles as DB-UQ-02's enforcing index | |
| `daily_reports(membership_id, report_date) WHERE deleted_at IS NOT NULL` | Admin recovery view — the only place soft-deleted rows are queried | |
| **New:** `users(full_name COLLATE "ar_TN")` supporting index | `/groups/{id}/memberships` roster sort (TSQ-03) | Arabic-correct `full_name ASC` ordering |

No index exists for a column outside a named read path — consistent with DBD's own "avoid indexing every column" instruction. This document adds exactly one index beyond DBD v1.0's set, to close APIQ-NEW-01.

## 19. Transactions

Transaction boundaries are owned by the **use case**, per ADR-028 (TypeORM `QueryRunner`, use-case-owned). Restating DBD §27's five documented hazards with the use case that owns each transaction:

| Operation | Transaction boundary | Owning use case | Failure behavior |
|---|---|---|---|
| Accept Join Request | `join_requests` status transition + `memberships` insert + `memorization_coverage` seed, one transaction | `AcceptJoinRequestUseCase` (via DS-01) | `UPDATE ... WHERE status='Pending'` affecting 0 rows = already decided → clean `409`, no partial state |
| Remove Student | `memberships` terminate + cascade soft-delete of `daily_reports`/`weekly_reports`/`payment_records`, one transaction | `TerminateMembershipUseCase` | All-or-nothing; a failure mid-cascade rolls back the entire termination, membership stays Active |
| Submit Daily Report | Single insert only — **not** combined with the coverage update | `SubmitDailyReportUseCase` | Report insert commits independently; coverage update is a separate, post-commit event-driven step (ADR-026) — see below |
| Confirm Weekly Report | Single update (state transition), read set is immutable | `ConfirmWeeklyReportUseCase` | No race to protect — BR-21/22 already make the underlying reports immutable |
| Record Payment Cycle | Single insert | `RecordPaymentCycleUseCase` | Constraint violation on duplicate cycle surfaces as a clean `409` |

**Why Daily Report submission and coverage update are deliberately separate transactions:** ADR-026 dispatches domain events post-commit, fire-and-forget. If `SubmitDailyReportUseCase` also updated `memorization_coverage` inside the same transaction, a coverage-calculation bug could roll back an otherwise-valid, already-submitted report — unacceptable given BR-21's irreversibility guarantee (a lost report can't be resubmitted). The report commits first; `DE-05 DailyReportSubmitted` then triggers `DS-05 MemorizationProgressEngine` asynchronously. If that second step fails, the report is safe but coverage can drift — which is exactly why `CoverageReconciliationJob` (ADR-029) exists as a nightly correction, promoted to Required for this reason alone.

Every other use case's single repository call auto-commits — no explicit `QueryRunner` needed outside the two listed above (ADR-028).

## 20. Concurrency

All five documented concurrency hazards (SAS §26.4, restated in DBD §27) resolve to a **partial unique index**, not row-locking or elevated isolation. This is a deliberate simplicity choice (Rule 5) — Postgres's default `READ COMMITTED` is sufficient because no operation here reads a value and later writes based on it changing.

| Hazard | Protection | Isolation level needed |
|---|---|---|
| Double-accept/reject of a JoinRequest | `WHERE status='Pending'` guard on the UPDATE, 0-rows-affected = safe no-op | Default `READ COMMITTED` |
| Duplicate DailyReport (double-tap, retry) | `DB-UQ-04` partial unique — second INSERT fails at the constraint | Default |
| Duplicate JoinRequest / double membership | `DB-UQ-03` / `DB-UQ-02` | Default |
| Duplicate PaymentRecord for one cycle | `DB-UQ-06` | Default |
| Accept racing with Group archival | `DS-07`'s archival transaction auto-rejects every `Pending` request first; the accept's own `WHERE status='Pending'` guard catches the remaining TOCTOU window | Default — no elevated isolation needed, the unique-index-style guard already closes the window |

**Application-side pattern:** every write path that could race is implemented as "attempt the write, let the constraint reject it, translate the constraint violation into a clean HTTP error" — never a `SELECT` to check existence followed by a separate `INSERT` (a classic TOCTOU bug). This is enforced by convention in code review (§37), not by a linter rule, since it's a query-shape discipline rather than a syntactic one.

## 21. Validation Architecture

Four layers, applied consistently, with worked examples for each of the four use cases the megaprompt calls out specifically.

| Layer | What it checks | Mechanism | Failure mode |
|---|---|---|---|
| **Transport** | Request shape and types | `class-validator` DTOs + Nest's global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`) | `422` with per-field messages (API-X06, Arabic per NFR) |
| **Application** | Use-case preconditions (does this membership exist and belong to this caller, is there already a report today) | Use-case service, before invoking domain logic | `404`/`409` as appropriate |
| **Domain** | Business invariants (VR rules, INV rules) | Domain entity constructors / domain services — reject construction of an invalid entity | Domain exception → mapped to `422`/`400` by an exception filter |
| **Database** | Persistence-level guarantees, the final backstop | `CHECK`/`UNIQUE`/trigger constraints (§17) | `23xxx` Postgres error → mapped to `409`/`422` by a shared exception filter, never surfaced raw |

**Daily Report** (discriminated union — Normal/Absence/Revision, per UF §15):
- Transport: `SubmitDailyReportDto` validates the `type` discriminant and requires the correct field subset per type (`class-validator`'s conditional decorators).
- Application: confirms `report_date` is today, the caller has an Active membership, and no report exists yet for today (pre-check for a fast error path — the real guarantee is still `DB-UQ-04`).
- Domain: `AyahRange` VO rejects `end.ordinal < start.ordinal` (BR-52) at construction; `DailyReport` entity rejects an invalid type/field combination.
- Database: `DB-CHK-02`/`DB-CHK-03` (range ordering), `DB-UQ-04` (one report per day).

**Join Request:**
- Transport: `SubmitJoinRequestDto` — full `VO-08 ApplicantProfile` shape, VR-03…09.
- Application: confirms caller's role is `User` and they hold no existing `Pending` request.
- Domain: gender-match check (INV-10) evaluated before scoring; `memorized_hizb_count` bounds.
- Database: `DB-CHK-12` (cross-table gender match, redundant-but-authoritative backstop), `DB-CHK-13/14/15/16`, `DB-UQ-03`.

**Payment:**
- Transport: `RecordPaymentDto` — `cycle_index`, fixed `amount`.
- Application: `recorded_by` must be the membership's *currently assigned* Assistant (application-level per DBD Rule 4 classification, §17).
- Domain: `PaymentCycle` VO — `index >= 0`.
- Database: `DB-CHK-17/18`, `DB-UQ-06`.

**Membership** (termination path):
- Transport: none beyond the path ID.
- Application: confirms an Active membership exists for the given ID and the caller is Admin.
- Domain: `DS-08`'s INV-07 check if the termination path ever touches staff (it doesn't for student removal — this line documents why it's *not* invoked here, avoiding a false-positive coupling).
- Database: `DB-CHK-01` (`ended_at >= started_at`), soft-delete cascade via `RESTRICT` FKs.

## 22. Reporting Engine

**Daily Report** — stored and validated per §21. One immutable row per `(membership_id, report_date)`, one of three types (Normal/Absence/Revision), enforced by the discriminated-union DTO and the domain entity's own constructor rules.

**Weekly Report** — restates SAS §18.1–18.2 exactly, implemented as pure functions in `DS-02`/`DS-03`, never re-derived ad hoc in a controller or query:

```
classify(m, d) → DayClassification (VO-09): one of
  NO_REPORT | NORMAL | REVISION | ABSENT_EXCUSED | ABSENT_OTHER
```

Every weekly metric is a pure aggregation over `classify()` results across `EffectiveDays(m, w)`. Source data → calculation → aggregation → API representation, per metric:

| Metric | Source | Calculation | API field |
|---|---|---|---|
| `missed_daily_reports` | `classify(d)` for `d ∈ EffectiveDays` | `count(NO_REPORT)`, excludes recitation day + `ABSENT_EXCUSED` | `WeeklyReportDto.missed_daily_reports` |
| `missed_daily_memorization` | `classify(d)` + `no_memorization_today` on `NORMAL` days | `count(NO_REPORT ∨ ABSENT_OTHER ∨ (NORMAL ∧ no_memorization_today))` over `MemorizationExpectedDays`, excludes `REVISION` days | `.missed_daily_memorization` |
| `missed_daily_revision` | `classify(d)` + `no_revision_today` | same pattern over `EffectiveDays`; `REVISION` days never counted as a miss but stay in the denominator | `.missed_daily_revision` |
| `missed_50_repetitions` | `completed_50_repetitions` on memorization days | `count(NORMAL ∧ memo_range ∧ ¬completed_50_repetitions)`, denominator = days with memorization | `.missed_50_repetitions` |
| `missed_single_session` | `repetitions_in_single_session` | `count(NORMAL ∧ completed_50_repetitions ∧ ¬repetitions_in_single_session)` — excludes days that already failed the 50-repetition check (ISS-13's recommended reading) | `.missed_single_session` |
| `attended_recitation_call` | Student checkbox, recitation day | Self-declared boolean; defaults `false` if unconfirmed by student-local midnight | `.attended_recitation_call` |

Implementation note: these six calculations live in one place — `WeeklyMetricsCalculator` (application of DS-02/DS-03) — and are called identically whether producing the *live* current-week view (`GET /weekly-reports/current`, computed on read, never stored per ADR-003) or the *finalized* snapshot (written once by `WeeklyReportFinalizationJob`). No second implementation exists anywhere else in the codebase; this is the single-source-of-truth requirement DMS §21.3 names explicitly.

**Performance Metrics** (Commitment Score, `DS-03`):

```
CommitmentScore = mean(defined components among {SubmissionRate, MemorizationRate, RevisionRate, AttendanceRate})
```

A component is **never** treated as 0 when undefined (DEC-B04) — a zero-denominator component is simply excluded from the mean, never coerced to a penalty value. If all four are undefined, the API returns `null` and the client shows "not enough data" (UF §17), never a fabricated 0.

`RepetitionQuality` is computed and returned as a **separate** field, deliberately not folded into `CommitmentScore` (§9.4.3's design intent, carried forward unchanged).

Nothing above is a new calculation — this section is the implementation address for SAS §18, not a re-derivation.

## 23. Quran Reference Implementation

Restates DMS §19 + DBD §10, with the one open item this document cannot resolve on its own.

| Concern | Implementation |
|---|---|
| Source | `surahs` (DBT-11) and `hizb_boundaries` (DBT-12) — deployment-loaded, read-only, never written by application code |
| IDs | Natural keys (`number`, `hizb_number`) — no UUID needed for static reference data |
| Storage of ayah positions | Precomputed **integer ordinal**, not `(surah, ayah)` pairs — `ordinal(s,a) = surahs[s].ordinal_offset + a`, computed once at deployment load time |
| Lookup strategy | Range containment/overlap/hizb-completion reduce to integer comparisons on the ordinal; `(surah, ayah)` reconstructed for display via a join to `surahs` only when rendering, never for calculation |
| Range validation | `AyahRange` VO rejects `end.ordinal < start.ordinal` (BR-52) at construction — this is where "the backend must reject invalid Quran ranges" is enforced, before any DB write is attempted |
| Versioning safeguard | `reference_data_version` (DBT-13, DBQ-06) — a one-row table so a future dataset correction is detectable against every ordinal already persisted in `daily_reports`/`coverage_intervals` |
| Coverage algorithm | `insert(coverage, [lo, hi])` interval-merge, `DS-05 MemorizationProgressEngine` — O(log n + k), never exceeds 60 hizb-worth of fragmentation in practice |
| Seeding at membership creation | Coverage initialized from `memorized_ahzab` (the applicant's declared set, not a count) — exact regardless of memorization order |

⚠️ **BLOCKING for this phase only — TSQ-10 / VER-01.** The `surahs`/`hizb_boundaries` deployment dataset must match the mushaf the center actually teaches: **Hafs ʿan ʿĀṣim** (Al-Baqara = 286 ayat) is assumed as the provisional default, but Warsh/Qalun (285 ayat) would silently corrupt every ayah validation and hizb boundary if the center actually teaches a different riwaya. This is a one-time verification, not an architectural decision — it does not block any other phase, but **it must be confirmed before `surahs`/`hizb_boundaries` seed data is finalized** (§41). Everything else in this section is riwaya-agnostic and correct regardless of the answer.

## 24. Performance Implementation

| Concern | Decision |
|---|---|
| Student Performance | `DS-03 CommitmentScoreCalculator` — pure, read-time, over a caller-supplied period intersected with the membership's effective window |
| Group Performance | Aggregation of the same per-membership calculation across the group's roster, computed in one bounded query per SA §20's "one range scan, not per-element queries" note |
| At-Risk | `DS-04 AtRiskDetectionService` — single definition (DEC-B05): last 3 expected days, evaluated backwards from today, all `NO_REPORT`; excused/other-absence reports **break** the streak; recitation days are skipped, not counted; terminated memberships excluded entirely |
| Computed live, cached, materialized, or precomputed? | **Live, on every request.** No caching layer exists for performance data (ADR-031 scopes caching to static reference data only) — every dashboard read resolves to one bounded, index-backed query per NFR-11's <3s/3G budget, not to a cache invalidation problem. This is the simplest valid approach per Rule 5: correct-by-construction via index design, not a caching layer with its own staleness bugs |

The "days since last report" figure on the individual dashboard uses the same expected-day counting as `AtRisk`, not raw calendar days — so the two can never disagree (closes CON-07, carried forward unchanged).

## 25. Payment Implementation

Restates SAS §18.5 + ADR-006 (no cycle rows stored) + DBD DBT-08. `DS-06 PaymentCycleDerivationService` derives everything at read time from `membership.started_at` and the set of `PaymentRecord` rows that exist:

```
cycle(i)       = [C0 + 3i months, C0 + 3(i+1) months − 1 day]
status(i)      = Paid (a PaymentRecord exists) | Due Soon (current cycle, ≤10 days to end) | Unpaid
next_due_date  = end of the earliest unpaid cycle
arrears_count  = count of past, unpaid cycles
```

⚠️ Recommend **clamping** end-of-month arithmetic to the last valid day for memberships starting on the 29th–31st (ISS-14, Low — carried forward as a documented implementation note, not re-opened as a question since SAS/DBD already recommend clamping and nothing downstream contradicts it).

| Concern | Implementation |
|---|---|
| Entity | `PaymentRecord` (E-07, DBT-08) — one row per confirmed-paid cycle, never per cycle in general |
| Status transitions | None — a `PaymentRecord` is created once, fully immutable (`DB-CHK-11`), never updated |
| Authorization | Only the membership's *currently assigned* Assistant may record a payment — application-layer check (§17, DBD Rule 4 classification) |
| Validation | Fixed `amount = 30` (`DB-CHK-17`), `cycle_index >= 0` (`DB-CHK-18`), one record per `(membership_id, cycle_index)` (`DB-UQ-06`) |
| Audit | `PaymentRecorded` (DE-08) is one of the three explicitly audited actions (`audit_entries`, Administration module) |
| Correction path | **None for MVP** (DBQ-02, ISS-02 accepted) — no reversal, no update, no delete. This is a confirmed downstream decision, not an omission; the Technical Spec does not reopen it |

No payment gateway, no online payment flow — payments are Assistant-recorded assertions of a cash transaction that happened offline, exactly as SRS/SAS specify. Rule 2 (do not invent features) applies directly here.

## 26. Mobile State Management

Expands §10's state table with the allocation rule for each category, and explicitly separates what belongs in global state from what doesn't — per the megaprompt's "avoid putting everything into global state" instruction.

| State category | Belongs in | Does NOT belong in | Reason |
|---|---|---|---|
| Server state (groups, reports, performance, payments, progress) | TanStack Query cache, keyed by endpoint+params | Zustand, component state | It's a cache of server truth with its own invalidation semantics (refetch-on-focus, refetch-on-mutate) — Zustand has no query-cache primitives and duplicating this by hand reintroduces staleness bugs |
| Auth session (access token in memory, refresh token, role) | Zustand `authStore` | TanStack Query | Session identity isn't a server *resource* fetched by a query key — it's ambient context every query depends on (the JWT interceptor reads it) |
| Form state (join application, daily report, group create/edit) | React Hook Form, local to the screen | Zustand, TanStack Query | Ephemeral, single-screen-lifetime — promoting it to global state would let stale form data leak across navigations, which UF §25 explicitly does not want (no draft persistence) |
| UI-only state (bottom sheet open/closed, wizard step, tab selection) | `useState` local to the component | Zustand | No other screen ever needs to know this |

**Mutation pattern:** every write endpoint (`POST`/`PATCH`/`DELETE`) is a TanStack Query mutation that invalidates the specific query keys it affects — e.g., `SubmitDailyReportUseCase`'s mutation invalidates `['daily-reports','today']`, `['daily-reports','mine']`, and `['performance','mine']` (since a new report changes the live weekly view). No manual cache-poking; invalidation keys are declared once per mutation hook and are the single source of truth for "what does this write affect."

## 27. Caching

Restates ADR-031 exactly — there is effectively no caching layer in this system, by design (Rule 5, DEC-C11's "correct by construction, not fast by luck").

| Data | Cache? | TTL | Invalidation | Reason |
|---|---|---|---|---|
| `GET /quran/surahs`, `GET /quran/hizb-boundaries` | Yes — HTTP `Cache-Control` headers only (long max-age) | Effectively until `reference_data_version` changes | Manual — a dataset reload bumps `reference_data_version`, client cache is version-keyed | Static, deployment-loaded, changes only on a dataset correction (VER-01) |
| Everything else (groups, reports, performance, payments, dashboard) | No server-side cache | — | — | Mutable business state; NFR-11's <3s/3G budget is met by index design (§18), not caching — a cache here would need an invalidation strategy this document explicitly declines to build |
| Mobile TanStack Query cache | In-memory only, per session | Default TanStack staleness (no custom `staleTime` beyond the library default) | Automatic on mutation (§26), on refetch-on-focus | Not a server cache — client-side UX responsiveness only, never persisted (ADR-025, NFR-02) |

No Redis, no application-level cache, no CDN in front of the API (there is no CDN in this deployment at all — ADR-031 explicitly notes long cache headers substitute for one on a self-hosted VPS).

## 28. Network Failure Strategy

Restates SA §32 (Failure Handling), with explicit mobile-side behavior for the failure modes that reach the client.

| Failure | Mobile behavior | Backend guarantee that makes this safe |
|---|---|---|
| Request timeout | Show a generic retry banner; do **not** auto-retry a write silently | Every write is protected by a partial unique index (§20) — a retried write either succeeds once or returns a clean `409`, never a duplicate |
| Network disappears mid-request | Same as timeout — "no connection" state (NFR-02), no offline queue, no drafting | — |
| Server returns `500` | Generic retry banner, no detail shown | Full detail is server-logged against `correlationId` only (§29) |
| Token expires mid-session | Transparent — `AuthGuard` returns `401`, API client's interceptor attempts silent refresh, replays the original request once | Refresh rotation (§14) makes this safe even under concurrent requests |
| Request succeeds but response is lost (classic double-submit risk) | User may retry the action (e.g., tap "Submit" again) | The retry hits the same partial-unique-index guard — a second `POST /daily-reports` for the same date returns `409`, mapped by the client to "already submitted today," never a silent duplicate |

**Report submission specifically** (the megaprompt calls this out explicitly): `SubmitDailyReportUseCase`'s only duplicate-prevention mechanism is `DB-UQ-04`. The mobile client does **not** implement its own idempotency-key/dedup logic — the database constraint is the single source of truth, and the client's job is only to translate a `409` on this specific endpoint into "you already reported today" rather than a generic conflict message (API's `error: "DUPLICATE_REPORT"` machine-readable code, APIS §9.5, makes this translation trivial).

## 29. Error Handling

Restates SA §24 + APIS §9.5/§9.6 exactly — this document adds no new error category.

**Backend responsibility:**

```json
{
  "statusCode": 422,
  "error": "VALIDATION_ERROR",
  "message": "الرجاء إدخال سبب الغياب",
  "details": [{ "field": "absence_reason", "rule": "VR-19", "message": "مطلوب عند نوع الغياب" }],
  "correlationId": "c7f1e2a4-..."
}
```

One global NestJS exception filter maps every thrown exception (domain, application, or unexpected) to this envelope. `details` appears only on `422`. Nothing beyond `correlationId` ever identifies an internal detail — no Postgres error text, no constraint name, no stack trace, no file path, at any status code, ever (this is a hard rule enforced by the filter's implementation, not a per-handler discipline that could be forgotten).

| HTTP | Category | `error` code examples |
|---|---|---|
| `401` | Authentication | `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` |
| `403` | Authorization (uniform with 404 for scope, NFR-20) | `SCOPE_DENIED` |
| `404` | Not found | `NOT_FOUND` |
| `409` | Conflict | `DUPLICATE_REPORT`, `ALREADY_DECIDED`, `ALREADY_PAID` |
| `422` | Validation / business rule | `VALIDATION_ERROR`, `GROUP_NOT_ELIGIBLE` |
| `429` | Rate limit | `RATE_LIMITED` |
| `503` | Database unreachable | `SERVICE_UNAVAILABLE` |
| `500` | Unexpected | `INTERNAL_ERROR` (generic; full detail server-side only) |

**Mobile responsibility:** SA §9's error-mapping table, unchanged — `401`→silent refresh then logout; `403`→permission-denied screen, no explanation; `409`→inline conflict message keyed off `error`; `422`→field-level errors from `details`, in Arabic, attached to the originating form (React Hook Form's `setError`, preserving whatever else the user had filled in); `5xx`→generic retry banner. Navigation never discards in-progress form state on an error response — only on an explicit user action or successful submission.

## 30. Logging

Restates ADR-033. Structured JSON via **Pino**, every line carrying `correlationId` (generated per-request, propagated through the whole call chain including async event handlers).

| Level | Used for |
|---|---|
| `DEBUG` | Local development only — SQL query timing, use-case entry/exit. Disabled in production. |
| `INFO` | Request completed (method, route, status, duration, `correlationId`); scheduled job run outcome; notification dispatch outcome |
| `WARN` | Recoverable anomaly — FCM token invalidated, Mailgun retry, scheduler catching up after a missed tick |
| `ERROR` | Unhandled exception (full detail, `correlationId`), failed scheduled job, Postgres unreachable |

**Never logged** (Pino `redact` configuration, applied structurally, not by convention): `password`, `password_hash`, the `Authorization` header, both raw token values (access and refresh), and any field DBD/SAS mark personal-data-sensitive beyond what NFR-10 already permits server-side (e.g., applicant phone/email are logged only as part of a request's metadata never as a bare unredacted field in a log line body).

**Security logs** (a subset of `INFO`/`WARN`, same pipeline, no separate system): authentication failures, rate-limit trips, `403` scope denials — all carry `correlationId` and are the raw material for the authz-failure-rate metric in §31.

**Business audit logs** are a distinct, separate mechanism — `audit_entries` (DBT-18), covering exactly the 3 actions SAS §21 audits (payment recorded, student removed, role promotion). This is a database table, not a log line, and is queried via `GET /audit` (API-054), not grep'd from application logs.

## 31. Observability

Restates ADR-033 — deliberately minimal, no Prometheus/Grafana/Jaeger (Rule 3/5).

| Concern | Approach |
|---|---|
| Health checks | A lightweight `GET /health` endpoint (DB connectivity check) — Coolify polls this for zero-downtime rollout (§27, §42) |
| Error monitoring | Structured `ERROR`-level logs, grepped/alerted manually at this scale — no Sentry/Bugsnag, consistent with Rule 3's forbidden-list check |
| Tracing | **Not built.** No service boundary exists to trace across in a modular monolith; `correlationId` gives equivalent request-level visibility at far lower operational cost |
| Metrics | Four specific counters, not a general metrics platform: scheduled-job run outcome (success/fail per job per tick), notification dispatch outcome (from `notification_log`), daily submission rate vs. the 80% product target, authz-failure-rate |
| Database monitoring | Coolify's built-in Postgres container health check; `pg_dump` backup job success/failure feeds Healthchecks.io |
| Alerting | **Healthchecks.io** dead-man's-switch — every scheduled job (`WeeklyReportFinalizationJob`, `CoverageReconciliationJob`, `DailyReminderEvaluationJob`, `AtRiskEvaluationJob`, `PaymentDueSoonEvaluationJob`) pings on success; a missed ping alerts. This directly closes SAS's ISS-01 ("scheduler failure is silent") |

## 32. Configuration

Restates ADR-037 (Coolify's built-in encrypted env-var store, no separate vault) with the concrete variable catalogue.

| Variable | Purpose | Required | Secret |
|---|---|---|---|
| `DATABASE_URL` | Postgres connection string | Yes | Yes |
| `JWT_ACCESS_SECRET` | Access-token signing key | Yes | Yes |
| `JWT_REFRESH_PEPPER` | Refresh-token hashing pepper, separate from the access secret | Yes | Yes |
| `MAILGUN_API_KEY` | Password-reset email delivery | Yes | Yes |
| `MAILGUN_DOMAIN` | Sending domain (sandbox in Dev/Preview, production domain in Production) | Yes | No |
| `FCM_SERVICE_ACCOUNT_JSON` | Push dispatch via Expo→FCM | Yes | Yes |
| `HEALTHCHECKS_PING_URL_*` | One per scheduled job, for the dead-man's-switch | Yes | No (URL is a capability token in practice, but treated as non-secret per Healthchecks.io's own model) |
| `NODE_ENV` | `development` \| `production` | Yes | No |
| `PORT` | API listen port | Yes | No |
| `EXPO_PUBLIC_API_BASE_URL` | Mobile's backend base URL, baked in at build time | Yes | No — public by definition (SA §29) |

No API keys, credentials, or secret values appear in this document, per Rule 4 ("do not provide actual secret values") — this table is the catalogue, not the vault.

## 33. Environment Management

Restates ADR-022/036 with the practical developer-facing detail SA left at the architecture level.

| | Development | PR Preview | Production |
|---|---|---|---|
| Database | Local Docker Compose Postgres | Isolated, disposable, fixture-seeded (ADR-036) | Coolify-managed Postgres |
| Backend run | `npm run start:dev` (Nest watch mode) against local Compose DB | Auto-deployed per PR, torn down on close/merge | Auto on merge to `main` |
| Mobile run | Expo Go / dev client against local backend (`EXPO_PUBLIC_API_BASE_URL` pointed at `localhost`/LAN IP) | Not wired to preview backend URLs (named scope limit, SA §28) | Production build via EAS |
| Email | Mailhog (local SMTP capture, no real delivery) | Mailgun sandbox domain | Mailgun production domain |
| Push | Expo test device, manual token registration | Sandbox posture | FCM production |
| Migrations | Run manually (`typeorm migration:run`) against local DB | Applied automatically as part of preview provisioning, against the fixture-seeded DB | Applied automatically as a pre-deploy CI/CD step (§39), never manually via SSH |
| Seed data | Full dev fixture set (§41) | Same fixture set, fresh per PR | **Never seeded** — production starts with only the seeded Admin account (ISS-07's forced-password-change applies) |

## 34. Testing Strategy

Per TSQ-07: Jest+Supertest (backend), Jest+React Native Testing Library (mobile). No E2E device automation (Detox) for MVP — not justified by Rule 5 at this scale; revisit only if manual QA proves insufficient.

| Level | Scope | Tooling | Runs against |
|---|---|---|---|
| Unit | Domain entities, value objects, domain services (DS-01…08) in isolation | Jest | Nothing — pure functions/classes, no DB, no HTTP |
| Integration | Use-case services + real repository implementations | Jest + a real (test) Postgres via Docker Compose | Local test DB, migrated fresh per run |
| API / Contract | Every endpoint's request/response shape against APIS.md | Jest + Supertest, hitting the actual Nest app in-process | Test DB |
| Database | Constraints, triggers, partial unique indexes | Jest + Supertest (via the use cases that exercise them) — no separate raw-SQL test suite, since every constraint is already exercised through its owning use case | Test DB |
| Authorization | Every `@Roles`/`ScopeGuard` combination — correct role, wrong role, correct role wrong resource | Jest + Supertest, parameterized per role | Test DB |
| Mobile component/unit | Screens, feature hooks, form validation | Jest + React Native Testing Library | Mocked API client |
| End-to-End (manual, not automated for MVP) | Full user journeys (§46) | Manual QA against a Preview environment | Preview DB |

## 35. Domain Testing

Test categories for the business rules the megaprompt calls out specifically, each traced to its owning invariant/rule:

**Join Request**
- Eligible user (gender matches, role=`User`, no existing Pending request) → accepted
- Ineligible user (gender mismatch, `INV-10`) → rejected at domain construction
- Duplicate request while one is already `Pending` → `DB-UQ-03` conflict
- Already a member (Active membership exists) → rejected at application layer

**Daily Report**
- Valid Normal/Absence/Revision report → persisted
- Invalid Quran range (`end.ordinal < start.ordinal`, BR-52) → rejected at `AyahRange` VO construction
- Wrong reporting day (report submitted for a date that isn't today, per BR-19/21) → rejected at application layer
- Duplicate report for the same date → `DB-UQ-04` conflict
- Absent report with no `absence_reason` where required → `422`, `VR-19`

**Authorization**
- Correct role, correct resource → `200`
- Wrong role entirely (e.g., Assistant calling a Reports endpoint) → `403` (never reaches `ScopeGuard` — not in `@Roles()`)
- Correct role, wrong resource (Teacher of Group A calling `GET /groups/{B}/performance`) → `403`, uniform with a non-existent group ID

**Weekly Calculation**
- Each of the six metrics (§22) tested independently against a hand-constructed week of `DailyReport` fixtures covering every `DayClassification`
- Zero-denominator cases (all days excused) → component `undefined`, never `0` (`DEC-B04`)

**Payment**
- Correct Assistant records a cycle → `PaymentRecord` created
- Wrong (unassigned) Assistant attempts to record → `403`, application-layer check
- Duplicate cycle → `DB-UQ-06` conflict

**Concurrency** (§20's five hazards, each with a dedicated test simulating two near-simultaneous requests against the same fixture)

## 36. Security Testing

Every item in §16's checklist becomes an automated test where feasible:

| Check | Test approach |
|---|---|
| `@Roles()` correctness | Parameterized Supertest suite hitting every endpoint with every role, asserting the authorization matrix (§15.1) exactly |
| `ScopeGuard` / IDOR | For every scoped endpoint: one test as the legitimate owner (`200`), one as a different, otherwise-valid staff member of a *different* group (`403`) |
| Mass assignment | POST/PATCH a payload with an extra, unexpected field (e.g., `role` on a profile update) → assert it's silently stripped, not applied |
| SQL injection | Not unit-tested directly (TypeORM's parameterization makes raw injection structurally unreachable) — enforced by code-review rule (§37) that no raw SQL string concatenation is ever introduced |
| Rate limiting | Integration test exceeding the `/auth/*` and `/join-requests` throttle limits, asserting `429` |
| Error envelope leakage | Assert no response body, at any status code, contains a Postgres error message, stack trace, or file path — a shared test helper asserts this against every error-path test automatically |

## 37. Project Structure

Monorepo (TSQ-06):

```
irtaki/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── identity/          (presentation | application | domain | infrastructure)
│   │   │   ├── groups/
│   │   │   ├── enrollment/
│   │   │   ├── memberships/
│   │   │   ├── reports/
│   │   │   ├── progress/
│   │   │   ├── performance/
│   │   │   ├── payments/
│   │   │   ├── notifications/
│   │   │   └── administration/
│   │   ├── shared/                 (exception filter, correlationId middleware, guards base classes)
│   │   └── main.ts
│   ├── migrations/                 (TypeORM, hand-reviewed — §40)
│   ├── seed/                       (§41)
│   └── test/
├── mobile/
│   ├── src/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── groups/
│   │   │   ├── joinRequests/
│   │   │   ├── membership/
│   │   │   ├── dailyReports/
│   │   │   ├── weeklyReports/
│   │   │   ├── performance/
│   │   │   ├── payments/
│   │   │   ├── progress/
│   │   │   └── notifications/
│   │   ├── shared/                 (API client, auth store, typed hooks, shared UI components)
│   │   └── navigation/             (role-based root navigator, per SA §9's table)
│   └── app.config.ts
├── docs/                           (this document, and the six upstream baselined specs)
└── .github/workflows/              (§39)
```

Each `modules/*` folder in `backend/` follows the four-layer shape from §9 (`presentation/`, `application/`, `domain/`, `infrastructure/` subfolders). Each `features/*` folder in `mobile/` contains its screens, its feature hook(s), and any feature-local components; truly shared components live in `mobile/src/shared/components/`.

## 38. Coding Conventions

| Concern | Convention |
|---|---|
| File naming | `kebab-case.ts` for backend, `PascalCase.tsx` for React components, `camelCase.ts` for hooks/utilities |
| Class naming | `PascalCase`, suffixed by role: `...UseCase`, `...Controller`, `...Repository`, `...Entity`, `...Dto` |
| DTO naming | Request: `{Verb}{Resource}Dto` (e.g., `SubmitDailyReportDto`); Response: `{Resource}Dto`/`{Resource}ResponseDto`; never reuse a request DTO as a response shape |
| Error naming | `error` codes are `SCREAMING_SNAKE_CASE`, matching APIS §9.5's examples exactly (`DUPLICATE_REPORT`, `SCOPE_DENIED`) — no ad hoc new codes without updating APIS.md |
| API naming | Exactly as specified in APIS §8 — no renaming, no restructuring, ever, without a documented APIS.md amendment |
| Database naming | Exactly as specified in DBD §31 — `snake_case` tables/columns, already fixed upstream |
| Domain type naming | Value objects match their DMS ID exactly (`AyahRange`, `CommitmentScore`) — no renaming during implementation |
| Git commit messages | Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`) — lightweight, tooling-friendly, no ceremony beyond the prefix |

## 39. Git Workflow

Per TSQ-08: trunk-based.

| Concern | Convention |
|---|---|
| Branching | Short-lived feature branches off `main` (`feat/daily-report-submission`, `fix/scope-guard-groups`) |
| Merging | Pull Request → squash-merge to `main`. No `develop` branch — there is no environment for one to point at (§33) |
| CI gate | Every PR must pass lint + unit + integration tests (§40) before merge is allowed — enforced as a required GitHub branch-protection check on `main` |
| Code review | At least one approval required before merge, even on a small team — self-merge disabled on `main` |
| Protected branches | `main` only — protected, no force-push, no direct commit |
| Release tagging | Mobile releases only (backend deploys continuously on every merge) — a git tag (`mobile-v1.2.0`) triggers the EAS Build+Submit pipeline (§27 SA diagram) |

## 40. CI/CD

Restates SA §27's diagram with the concrete pipeline steps GitHub Actions runs at each stage.

**Backend pipeline** (on every push/PR, and again on merge to `main`):

```
Push/PR → Lint (ESLint + Prettier check) → Type-check (tsc --noEmit)
        → Unit tests → Integration tests (against a fresh Dockerized Postgres in the runner)
        → Build (tsc / Nest build)
        → [merge to main only] → Coolify webhook → Coolify builds image,
          runs pending migrations, health-checks new container, rolls traffic over
```

No manual SSH deploy step exists anywhere in this pipeline (SA §27, restated unchanged).

**Mobile pipeline** (on release tag):

```
Tag pushed (mobile-v*) → Lint → Type-check → Unit tests
                        → EAS Build (iOS + Android) → EAS Submit → Play Store / App Store review
```

**PR Preview pipeline** (on PR open, per ADR-036):

```
PR opened → Coolify provisions an isolated preview environment
          → disposable Postgres, fixture-seeded (never a copy of production)
          → preview URL commented on the PR
          → torn down automatically on PR close/merge
```

## 41. Database Migration Strategy

Per TD-03: TypeORM migrations, hand-authored and reviewed, `synchronize: false` in every environment including local development (developers run migrations locally too, so schema drift between a developer's machine and CI/production is never possible by construction).

| Concern | Rule |
|---|---|
| Ownership | Whoever's PR needs a schema change writes and commits the migration file in the same PR — never a separately-scheduled "DB team" step |
| Development | `typeorm migration:run` against the local Docker Compose Postgres, manually, before starting the dev server |
| Preview | Applied automatically as part of Coolify's preview provisioning, against the disposable fixture DB |
| Production | Applied automatically as a pre-deploy CI/CD step (§40) — Coolify runs migrations before rolling traffic to the new container, never after |
| Rollback | TypeORM's `migration:revert` for the most recent migration; no automatic rollback-on-failure — a failed migration blocks the deploy (traffic never rolls over to a container whose migration didn't succeed) |
| Review | Every migration file is reviewed like any other code change (§39) — no auto-generated migration is merged without a human reading the generated SQL |

## 42. Seed Data

Per TSQ-09, confirmed scope for **development and PR-preview environments only** — never production.

| Category | Scope |
|---|---|
| Users | 1 Admin (with `must_change_password = true`, exercising ISS-07's forced-reset path), 2 Teachers, 2 Assistants, ~10–15 Students |
| Groups | 2 groups — one Male, one Female — each with an assigned Teacher and Assistant, `recitation_day` varied between the two |
| Memberships | Students distributed across both groups, a mix of `Active` and one `Terminated` (to exercise the recovery-view path, UC-16) |
| Daily/Weekly Reports | A few weeks of history per active membership, deliberately including at least one of each `DayClassification` (Normal, Revision, Excused Absence, Other Absence, No Report) so every weekly metric (§22) has a non-trivial value to inspect |
| Payments | A mix of `Paid`, `Due Soon`, `Unpaid`, and one `arrears` case |
| Quran reference data | Full `surahs` + `hizb_boundaries` dataset — **⚠️ pending TSQ-10/VER-01's riwaya confirmation (§23) before this is finalized** |
| Notification categories | Full static catalogue (`notification_categories`, DBT-15) — required for the app to function at all, not really "seed data" in the optional sense |

Production seeds **only** the single Admin account (per SAS ISS-07 / FR-AUTH-06) — nothing else. Seed scripts live in `backend/seed/` and are never invoked against a production `DATABASE_URL` (a guard in the seed script itself checks `NODE_ENV !== 'production'` and refuses to run otherwise).

## 43. Deployment Architecture

Restates SA §27 exactly — this document adds no new deployment decision, only the concrete step sequence already covered in §40.

```
Developer → git push → GitHub → GitHub Actions (lint, test, build)
          → [main] → Coolify webhook → Coolify (Traefik + auto TLS)
          → NestJS API container ↔ PostgreSQL, both on VPS #1
          → 12h scheduled backup → MinIO on VPS #2
Mobile: release tag → EAS Build → EAS Submit → Play Store / App Store → user's phone
```

Two Tunisian VPS instances (ADR-014, ADR-035): VPS #1 runs Coolify + API + Postgres; VPS #2 runs only MinIO, so a total VM loss on #1 doesn't destroy the database and its backups in the same event.

## 44. Backup & Recovery

Restates ADR-038/039 exactly.

| | Value |
|---|---|
| Mechanism | Coolify-scheduled `pg_dump` → MinIO |
| Frequency | Every 12 hours |
| RPO | ≤12 hours |
| Retention | 30 days rolling |
| RTO | No hard target — manual restore via a fresh Postgres container + latest dump, honestly stated rather than invented |
| Restore testing | Quarterly manual drill |
| Coolify instance-state | Included in the same backup schedule (repo connections, env vars, deployment state) — restoring data without the ability to redeploy isn't a complete recovery |
| Accepted residual gap | No backup-of-the-backup — VPS #2 (MinIO) is itself a single point of failure; not solved with a third VPS per Rule 3 |

## 45. Technical Debt

Decisions intentionally deferred, named explicitly so they never become a hidden assumption.

| ID | Deferred Decision | Reason | Future Impact |
|---|---|---|---|
| TDR-01 | No payment correction/reversal path (DBQ-02, ISS-02) | Accepted MVP limitation, confirmed downstream of SAS's own recommendation | A mistaken payment record requires direct DB intervention until revisited |
| TDR-02 | No `group_staff_assignments` history table (DBQ-03, ISS-04) | Accepted MVP limitation | Staff reassignment grants immediate full historical visibility with no period-scoping and no trace |
| TDR-03 | No retention/purge policy for `notification_log`/soft-deleted rows (DBQ-05, ISS-08) | Accepted MVP limitation | Unbounded row growth over years of operation; revisit before it becomes an operational problem, not before |
| TDR-04 | No E2E device automation (Detox) | Not justified at MVP scale/team size (Rule 5) | Manual QA carries the full regression-testing burden until the team or app size changes that calculus |
| TDR-05 | `dashboard_route` field dropped (TSQ-02) | Client routes from `role` alone | If a future role needs a non-obvious route, this may need revisiting — currently no such case exists |
| TDR-06 | No backup-of-the-backup (ADR-034, accepted residual gap) | A third VPS is disproportionate for MVP (Rule 3) | VPS #2/MinIO is a genuine single point of failure for backup data specifically (not live data) |
| TDR-07 | DBD.md's own text (§22.1, §31, §34) still reads "Recommended, not Confirmed" for `groups.name` uniqueness, despite APIQ-05 confirming it | Documentation lag between the DBD and APIS phases, resolved here (TSQ-01) but not yet reflected upstream | Low — purely a documentation-consistency debt; the actual implementation in §17 is correct regardless. Recommend a one-line DBD.md amendment at the next document revision |

## 46. Implementation Order

Dependency-driven sequence — each step assumes everything above it exists and is tested.

1. Monorepo scaffold (backend + mobile skeletons, CI pipeline skeleton — §37, §40)
2. Database schema + migrations for all 19 tables (§17), no application code yet
3. Identity module (registration, login, JWT issuance/refresh, argon2id) — §14
4. `RolesGuard`/`ScopeGuard` authorization scaffolding (§15) — built once, reused by every module from here on
5. Groups module (create, list, available, staff assignment)
6. Enrollment module (join request submit/review/accept/reject) + Memberships module (roster, terminate, recovery) — built together since DS-01 spans both
7. Progress module (Quran reference data load — **pending TSQ-10**, coverage seeding, coverage engine)
8. Reports module (daily report submission, weekly live/finalization)
9. Performance module (Commitment Score, at-risk — read-only, depends on Reports+Memberships+Progress existing)
10. Payments module
11. Notifications module (device tokens, preferences, dispatch, scheduled evaluators)
12. Administration module (audit log, user listing, role promotion)
13. Dashboard aggregation endpoint (`GET /me/dashboard`) — depends on Performance/Progress/Payments all existing
14. Mobile: Identity/auth flow, role-based navigation shell
15. Mobile: remaining feature modules, screen by screen, following the Vertical Slices order (§47) rather than building all backend-adjacent screens after all backend modules
16. Full regression pass (domain + security test suites, §35/§36) before first Production deploy
17. Production deployment, seeded Admin only (§42), Coolify cutover

## 47. Vertical Slices

Preferred over strict layer-by-layer construction — each slice is deployable and demoable end-to-end before the next begins, catching integration mismatches early rather than at the very end.

| Slice | Scope (Backend → API → Mobile → Tests) |
|---|---|
| 1. Authentication | Identity module, `/auth/*`, Login/Register/Password-reset screens, auth guard tests |
| 2. Group discovery | Groups module (read paths), `/groups`, `/groups/available`, Group Discovery/Details screens, gender-eligibility tests |
| 3. Join request | Enrollment module, `/join-requests/*`, Join application wizard + Assistant review queue, DS-01 concurrency tests |
| 4. Membership & roster | Memberships module, `/memberships/*`, Membership status screens + Teacher/Assistant roster view, soft-delete/recovery tests |
| 5. Daily reporting | Reports (daily) + Progress modules, `/daily-reports/*`, Daily Report form (3 types) + Report History, validation/immutability tests |
| 6. Weekly reporting & performance | Reports (weekly) + Performance modules, `/weekly-reports/*`, `/me/performance`, Weekly Report + Performance screens, the six-metric calculation test suite (§22) |
| 7. Payments | Payments module, `/payments/*`, Payment tabs (Student + Assistant), cycle-derivation tests |
| 8. Notifications | Notifications module, `/devices`, `/notification-preferences`, push registration + preferences screen, scheduler-evaluator tests |
| 9. Administration | Administration module, `/users`, `/audit`, `/users/{id}/role`, Admin screens, audit-entry tests |
| 10. Dashboard aggregation | `GET /me/dashboard` cross-module orchestrator, role-specific home screens, the one-call-not-six budget test (NFR-11) |

Each slice ends with its own regression pass before the next starts — this is what makes "vertical" meaningful here, not just an ordering preference.

## 48. Definition of Done

A feature (or vertical slice) is complete when, and only when:

- [ ] Every requirement it covers (SRS FR/BR) is implemented as specified — no silent scope change
- [ ] Every domain rule it touches (DMS invariant, VO validation) is enforced at the domain layer, not just the DTO layer
- [ ] The API contract matches APIS.md exactly — endpoint, method, status codes, error `error` codes, response shape
- [ ] The UI matches UF.md's screen specification and component inventory
- [ ] All four validation layers (§21) are in place where applicable — transport, application, domain, database
- [ ] Authorization is tested for every role×resource combination named in §15.1, including at least one negative (wrong role, wrong scope) test per endpoint
- [ ] Error states are handled per §29 — no unhandled promise rejection, no raw error surfaced to the mobile UI
- [ ] Unit + integration tests pass (§34/§35), and security tests pass (§36) for any new authorization surface
- [ ] Migration files (if any) are reviewed and applied cleanly against a fresh database
- [ ] This document's traceability table (§49) is updated if the feature introduces or closes a traceability row
- [ ] Code reviewed and approved per §39's branch protection, merged via squash to `main`

## 49. Requirement Traceability

Representative chain — every FR group and UC is covered; full row-per-requirement detail lives in each upstream document's own traceability section (SAS §27, APIS §13, UF §38–40) and is not re-derived here, only bridged to its technical module.

| Requirement | Use Case | Domain | Database | API | Screen | Technical Module | Tests |
|---|---|---|---|---|---|---|---|
| FR-AUTH | UC-01 | E-01 User, ST-01 | `users`, `auth_tokens` | API-001…008 | Login/Register/Reset (UF §9) | Identity | §35 (Auth suite), §36 |
| FR-JOIN | UC-03 | E-04 JoinRequest, VO-08 | `join_requests`, `join_request_ahzab` | API-019…020 | Join Application Wizard (UF §13) | Enrollment | §35 (Join Request suite) |
| FR-REQ | UC-04 | ST-04, DS-01 | `join_requests` | API-021…024 | Review Queue (UF §13) | Enrollment | §35, concurrency (§20) |
| FR-GRP | UC-10, 11, 13, 14 | E-02 Group, DS-07, DS-08 | `groups` | API-010…018 | Group management screens (UF §10, §26) | Groups | §35 (Group lifecycle) |
| FR-DR | UC-05 | E-05 DailyReport, VO-01/02/03 | `daily_reports` | API-029…032 | Daily Report form (UF §15) | Reports | §35 (Daily Report suite) |
| FR-WR | UC-06 | E-06 WeeklyReport, DS-02 | `weekly_reports` | API-033…036 | Weekly Report (UF §16) | Reports | §22, §35 (six-metric suite) |
| FR-PERF | UC-02, 07, 08 | DS-03, DS-04, VO-06 | reads across `daily_reports`/`memberships` | API-037…040 | Performance tabs (UF §17) | Performance | §35 (Commitment Score, at-risk) |
| FR-PROG | *(implicit in UC-02/08)* | E-08, DS-05, VO-01/02/07 | `memorization_coverage`, `coverage_intervals`, `surahs`, `hizb_boundaries` | API-041…044 | Progress tab (UF §19) | Progress | §23's Quran-range tests; **blocked pending TSQ-10 for seed correctness** |
| FR-PAY | UC-09 | E-07 PaymentRecord, DS-06, VO-05 | `payment_records` | API-045…047 | Payment tabs (UF §18) | Payments | §35 (Payment suite) |
| FR-NOTIF | UC-15, 18 | E-09/10/11, DE-13/14/15 | `device_tokens`, `notification_preferences`, `notification_log` | API-048…051 | Notification Preferences (UF §8 UXQ-02) | Notifications | Scheduler-evaluator tests |
| FR-AUDIT / FR-ADMIN | UC-16, 17 | E-12 AuditEntry | `audit_entries`, `users` | API-052…054 | Admin screens (UF §10 Admin) | Administration | Audit-entry write tests |

## 50. Technical Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Quran dataset riwaya mismatch (VER-01) silently corrupts every ayah validation and hizb boundary | Low (verification is straightforward) | High if it happens — every stored ordinal becomes wrong | **Do not seed/deploy `surahs`/`hizb_boundaries` until TSQ-10 is answered (§23, §42)** — a one-time gate, not an ongoing risk once cleared |
| Coverage drift if `CoverageReconciliationJob` (ADR-029) itself fails silently | Low | Medium — dashboards show slightly stale progress until the next successful run | Healthchecks.io dead-man's-switch (§31) alerts on a missed run |
| VPS #1 total failure | Low | High — full outage until manual restore | Documented manual recovery path (§44); accepted RTO gap, honestly stated rather than a false guarantee |
| VPS #2 (MinIO) failure coinciding with a VPS #1 failure | Very low | High if both occur together | Accepted residual gap (TDR-06) — not solved for MVP, named explicitly |
| Cross-border data flow via Mailgun/FCM vs. Tunisia's data-residency framework | Unresolved legal question, not a technical one | Potentially high (compliance) | Flagged for legal confirmation (SA §25, carried forward unchanged) — outside this document's authority to resolve |
| Scope creep during implementation (a developer "fixes" a gap by inventing behavior) | Medium — the natural failure mode of any spec this detailed | Medium — silently diverges from the baselined documents | §48's Definition of Done requires an explicit traceability check; any gap found during implementation is a new question for this document, not a unilateral code-level decision |
| DBD.md/APIS.md text divergence (TDR-07) repeats for a future amendment if not corrected at the source | Low | Low | Logged explicitly (§45) rather than left implicit |

## 51. Open Technical Questions

| ID | Question | Category |
|---|---|---|
| TSQ-10 | Which riwaya does the center teach — Hafs ʿan ʿĀṣim or Warsh/Qalun? Determines the `surahs`/`hizb_boundaries` seed dataset | **BLOCKING** — for Phase 23/Progress module and §42 seed data only; no other phase is affected |
| ISS-02 | No payment correction path | LOW — accepted for MVP, revisit only if operationally painful |
| ISS-04 | Staff reassignment grants full historical visibility, no trace | LOW — accepted for MVP |
| ISS-08 | No retention policy for logs/soft-deleted rows | LOW — accepted for MVP |
| ISS-12 | `read_tafsir` informational-only, confirmed by this document (TSQ-05) | Closed — no longer open |
| ISS-14 | End-of-month payment-cycle arithmetic — clamping recommended, not yet formally confirmed by Product Owner | LOW |
| Cross-border data flow (Mailgun/FCM) vs. data-residency | MEDIUM — legal, not architectural |
| Final VPS provider (TT Cloud vs. HexaByte/Orange) | LOW — practical prerequisite, not a design blocker |
| App store accounts (Apple, Google Play) provisioning | LOW — practical prerequisite |

Nothing above blocks starting implementation of Slices 1–9 (§47). Only Slice/module work touching Quran reference data (Progress module, Slice 5 onward) should pause for TSQ-10 specifically.

## 52. Final Architecture Review

| Criterion | Assessment |
|---|---|
| Requirements | Every FR group (§49) traces to a module; nothing from SRS/SAS was lost or altered |
| Domain | No domain rule was changed — every calculation in §22/§24/§25 is a restatement of DMS/SAS, not a re-derivation |
| Database | §17/§18 implement DBD's 18 tables plus the SA-introduced `auth_tokens` exactly, with the one resolved conflict (TSQ-01) logged, not silently applied |
| API | §13 maps all 54 endpoints 1:1 to APIS.md; no endpoint invented, none redesigned |
| UX | §10/§26/§28/§29 support UF's specified screens, states, and error mappings without adding client-side business logic |
| Security | §15/§16/§36 place authorization at the backend on every layer, doubled, never client-trusted |
| Testing | §34–36 make every business rule and every authorization combination testable, not just theoretically verifiable |
| Deployment | §43/§44 describe an architecture that has, in fact, already been provisioned in principle by SA §27–30 — nothing here requires infrastructure SA didn't already specify |
| Simplicity | No queue, no cache layer, no second service, no vault, no tracing platform, no E2E device automation — each considered and explicitly declined with a reason (§27, §31, §34), not silently omitted |

**Overall assessment.** This document introduces exactly seven Phase-10-specific technical decisions (§7, TD-01…07) and resolves one genuine cross-document conflict (TSQ-01) plus nine implementation-detail gaps (TSQ-02…09) that no upstream document addressed. One question remains genuinely open and is scoped narrowly enough that it blocks only the Quran-reference portion of implementation, not the project as a whole (TSQ-10/§51). No business rule, domain relationship, role permission, calculation, or API contract was invented or altered anywhere in this document.

---

*End of Irtaki Technical Specification v0.1.*