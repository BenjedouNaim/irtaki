# Irtaki — API Specification

## 1. Document Information

|                          |                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Document**             | API Specification (APS)                                                                                                                                                                                                                                                                                                                          |
| **Version**              | 1.0 — Baseline                                                                                                                                                                                                                                                                                                                                   |
| **Product**              | Irtaki — Quran Memorization Mobile Application                                                                                                                                                                                                                                                                                                   |
| **Status**               | Baselined — sole source of truth for backend and mobile implementation of the HTTP contract                                                                                                                                                                                                                                                      |
| **Author role**          | Senior API Architect / Backend Systems Analyst                                                                                                                                                                                                                                                                                                   |
| **Product Owner**        | Naim Benjedou                                                                                                                                                                                                                                                                                                                                    |
| **Authoritative inputs** | SRS v1.0, SAS v1.0 (§23 API Requirements is the confirmed endpoint-surface baseline), DMS v1.0, DBD v1.0, SA v1.0 (§13–15, §20–21, §24–25 bind auth/authz/API/dashboard/notification/error/security mechanics)                                                                                                                                   |
| **Precedence**           | This document does not redefine business rules, the domain model, or the schema — SAS/DMS/DBD remain authoritative for those. Where SAS §23 left an endpoint-level decision open (flagged ISS-xx, Product-Owner-owned), this document resolves it via the APIQ-01…10 decision log in §15 and is authoritative for that resolution going forward. |

## 2. API Objectives

This document answers one question: **how does the Irtaki mobile application communicate with the backend to accomplish every use case in SRS §6 / SAS §12?**

Every endpoint in this document traces to a specific FR, UC, or ADR. No endpoint exists because a database table exists (Rule 3 of the governing brief) — each is justified by a use case's need to read or change application state.

## 3. API Principles

1. **Resource-oriented, not table-oriented.** `/memberships/{id}/daily-reports` is a meaningful application resource path; `/daily_reports_table` is not. No endpoint exposes a database table 1:1 unless the table _is_ the meaningful resource (e.g. `groups`).
2. **Server-side authorization always.** Every endpoint enforces role (RBAC) and instance-level scope (§14 SAS) server-side; UI hiding is never the sole control (NFR-08, API-X01).
3. **Scope failures and not-found failures are indistinguishable.** A caller cannot use response shape to enumerate resources outside their scope (NFR-20, API-X03).
4. **Mobile-first.** Payloads are small, predictable, and safe to retry (Rule 5). Dashboard reads cost one round trip, not six (SA §20).
5. **The API does not invent business behaviour.** Where a useful endpoint would require a business rule the upstream documents don't state, it is flagged, not silently added — see §16 Open Questions.
6. **Nullable, not zero.** Any rate or score that cannot be computed for lack of data is returned as `null`, never `0` (DEC-B04, API-X07) — a client rendering `null` must show "not enough data," not a zero.

## 4. API Architecture

| Aspect                       | Decision                                                                                                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Protocol**                 | REST / JSON (ADR-021)                                                                                                                                                                                                                                             |
| **Versioning**               | URI-based: `/api/v1/...` (APIQ-06, confirmed). A `v2` prefix is introduced only for breaking changes; additive changes (new optional fields, new endpoints) ship into `v1` without a version bump.                                                                |
| **Base URL**                 | `https://{production-domain}/api/v1` — the production domain itself is an infrastructure detail (SA §37: VPS provider still open) and is out of this document's scope; the mobile app reads it from `EXPO_PUBLIC_API_URL` (SA §29).                               |
| **Content type**             | `application/json; charset=utf-8` for every request and response body. No form-encoded or multipart bodies anywhere in MVP (no file upload requirement exists).                                                                                                   |
| **Authentication mechanism** | `Authorization: Bearer {accessJwt}` header on every request except `POST /auth/register`, `POST /auth/login`, `POST /auth/password-reset/*`. Access JWT: 1 hour, stateless. Refresh token: 30 days, sliding, rotated on use, `Expo SecureStore` (SA §13).         |
| **Clock**                    | All timestamps in responses are ISO-8601 UTC (`TIMESTAMPTZ` at the DB layer, SA/DBD §26). All _dates_ (`report_date`, `week_start`, etc.) are plain `YYYY-MM-DD`, timezone-free — the server has already resolved them against `User.timezone` before persisting. |

### 4.1 Versioning migration strategy (Phase 2)

A breaking change (removing a field, changing a field's type, changing an endpoint's authorization or side effects) requires a new version segment. Because Irtaki has exactly one client (its own mobile app, force-updatable via app store review), the practical migration path is: ship `v2` alongside `v1`, force-update the app, retire `v1` once telemetry shows zero `v1` traffic. No dual-write or long-lived multi-version support is designed for — that would be over-engineering for a single-client MVP (Rule 3).

## 5. Authentication

Full mechanics: SA §13. Summary relevant to the contract:

| Token          | Lifetime                         | Where                                                                                 |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| Access (JWT)   | 1 hour                           | `Authorization: Bearer` header, every authenticated request                           |
| Refresh        | 30 days, sliding, rotated on use | Body of `POST /auth/refresh`; reuse of a revoked token forces re-login (theft signal) |
| Password reset | 30 min, single-use               | Emailed link token, body of `POST /auth/password-reset/confirm`                       |

`POST /auth/refresh` is added to the endpoint catalogue in this document — SAS §23's API-01 table omitted it, but SA §13's own sequence diagram requires it for the rotation mechanism to function. This is additive, not a contradiction of SAS.

## 6. Authorization

RBAC (role) + instance-level scope (ownership), enforced in that order, per SA §14:

```
Request → AuthGuard (401 if invalid/expired JWT)
        → RolesGuard (403 if role ∉ endpoint's allowed roles)
        → ScopeGuard (403 if resource outside caller's scope — same 403 as "not found", NFR-20)
        → Handler
        → Repository (scope filter re-applied, NFR-19 backstop)
```

Full endpoint-level matrix: §7. Scope definitions (unchanged from SAS §14.1) are the authority for what "own" / "assigned group" / "all" mean per role.

### 6.1 Authorization Matrix (Phase 26)

Legend: ✓ allowed · **own** = own resource only · **(g)** = assigned group(s) only · — not allowed · 🚫 = explicitly blocked even though the role could technically reach it

| Endpoint                                                                                  | Admin          | Teacher      | Assistant    | Student          | User                   |
| ----------------------------------------------------------------------------------------- | -------------- | ------------ | ------------ | ---------------- | ---------------------- |
| `POST /auth/register`, `/login`, `/refresh`, `/logout`, `/password-reset/*`               | ✓              | ✓            | ✓            | ✓                | ✓ (anon. before login) |
| `GET/PATCH /me`                                                                           | ✓              | ✓            | ✓            | ✓                | ✓                      |
| `GET /me/dashboard`                                                                       | ✓ (admin view) | ✓            | ✓            | ✓                | ✓                      |
| `GET /groups`, `GET /groups/{id}`                                                         | ✓ all          | ✓ (g)        | ✓ (g)        | ✓ (g, own group) | —                      |
| `GET /groups/available`                                                                   | —              | —            | —            | —                | ✓                      |
| `POST /groups`, `PATCH /groups/{id}`, `/staff`, `/lifecycle`, `DELETE /groups/{id}`       | ✓              | —            | —            | —                | —                      |
| `PATCH /groups/{id}/enrollment`                                                           | —              | ✓ (g)        | —            | —                | —                      |
| `POST /join-requests`                                                                     | —              | —            | —            | —                | ✓                      |
| `GET /join-requests/mine`                                                                 | —              | —            | —            | —                | ✓ own                  |
| `GET /join-requests?status=`, `GET /join-requests/{id}`                                   | ✓ all          | —            | ✓ (g)        | —                | —                      |
| `POST /join-requests/{id}/accept\|reject`                                                 | —              | —            | ✓ (g)        | —                | —                      |
| `GET /memberships/mine`                                                                   | —              | —            | —            | ✓ own            | —                      |
| `GET /groups/{id}/memberships`                                                            | ✓ all          | ✓ (g)        | ✓ (g)        | —                | —                      |
| `DELETE /memberships/{id}`                                                                | ✓              | —            | —            | —                | —                      |
| `GET /memberships/{id}/recovery`                                                          | ✓              | —            | —            | —                | —                      |
| `GET /daily-reports/today`, `POST /daily-reports`, `GET /daily-reports`                   | —              | —            | 🚫 (DEC-B09) | ✓ own            | —                      |
| `GET /memberships/{id}/daily-reports`                                                     | ✓ all          | ✓ (g)        | 🚫           | —                | —                      |
| `GET /weekly-reports/current`, `POST /weekly-reports/{id}/confirm`, `GET /weekly-reports` | —              | —            | 🚫           | ✓ own            | —                      |
| `GET /memberships/{id}/weekly-reports`                                                    | ✓ all          | ✓ (g)        | 🚫           | —                | —                      |
| `GET /me/performance`                                                                     | —              | —            | 🚫           | ✓ own            | —                      |
| `GET /groups/{id}/performance`, `/at-risk`                                                | ✓ all          | ✓ (g)        | 🚫           | —                | —                      |
| `GET /memberships/{id}/performance`                                                       | ✓ all          | ✓ (g)        | 🚫           | ✓ own            | —                      |
| `GET /me/progress`                                                                        | —              | —            | 🚫           | ✓ own            | —                      |
| `GET /memberships/{id}/progress`                                                          | ✓ all          | ✓ (g)        | 🚫           | —                | —                      |
| `GET /quran/surahs`, `/hizb-boundaries`                                                   | ✓              | ✓            | ✓            | ✓                | ✓                      |
| `GET /me/payments`                                                                        | —              | —            | —            | ✓ own            | —                      |
| `GET /groups/{id}/payments`                                                               | ✓ all          | 🚫 (SRS §10) | ✓ (g)        | —                | —                      |
| `POST /memberships/{id}/payments`                                                         | —              | —            | ✓ (g)        | —                | —                      |
| `POST /devices`, `DELETE /devices/{id}`, `GET/PATCH /me/notification-preferences`         | ✓ own          | ✓ own        | ✓ own        | ✓ own            | ✓ own                  |
| `PATCH /users/{id}/role`, `GET /users?role=`, `GET /audit`                                | ✓              | —            | —            | —                | —                      |

**Assistant's blanket exclusion** from Reports, Weekly Reports, Performance, and Progress (DEC-B09) is enforced by `RolesGuard` alone — Assistant simply isn't in those endpoints' `@Roles()` list, per SA §14.

## 7. Resource Catalogue (Phase 4)

| Resource Group   | Purpose                                        | Primary Actor(s)                         | Module (SA §11)                                |
| ---------------- | ---------------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Auth             | Register / authenticate / session lifecycle    | Anonymous → Any                          | Identity                                       |
| Me / Identity    | Own profile and role                           | Any authenticated                        | Identity                                       |
| Dashboard        | One-call, role-appropriate home view (APIQ-01) | Any authenticated                        | Performance / Progress / Payments (aggregated) |
| Groups           | Browse, create, staff, enrollment, lifecycle   | Admin, Teacher, User, Student            | Groups                                         |
| Join Requests    | Apply to a group; review; decide               | User, Assistant, Admin                   | Enrollment                                     |
| Memberships      | Roster; own enrollment; termination; recovery  | Student, Teacher, Assistant, Admin       | Memberships                                    |
| Daily Reports    | Submit / view daily memorization activity      | Student, Teacher, Admin                  | Reports                                        |
| Weekly Reports   | Confirm / view weekly summary                  | Student, Teacher, Admin                  | Reports                                        |
| Performance      | Commitment score, dashboards, at-risk          | Student, Teacher, Admin                  | Performance                                    |
| Progress / Quran | Coverage, ahzab completed, reference data      | Student, Teacher, Admin, Any (reference) | Progress                                       |
| Payments         | Derived ledger; record a cycle paid            | Student, Assistant, Admin                | Payments                                       |
| Notifications    | Device tokens; mute preferences                | Any authenticated                        | Notifications                                  |
| Administration   | Role promotion, user list, audit log           | Admin                                    | Administration                                 |

Deliberately **not** exposed as raw resources: `daily_reports_table`, `users_table`, `join_request_ahzab` (embedded in the `POST /join-requests` request body instead), `coverage_intervals` (internal to the Progress module's derivation, never returned row-by-row — only the derived `ahzab_completed` / coverage summary is), `notification_log` (write-only from the API's perspective; nothing reads it back), `payment_records` cycle rows (never stored, so never listed — only the _derived_ ledger from `GET /me/payments` / `GET /groups/{id}/payments`).

## 8. Endpoint Catalogue (Phase 39)

| ID      | Method | Endpoint                           | Purpose                            | Actor                       | Auth                   |
| ------- | ------ | ---------------------------------- | ---------------------------------- | --------------------------- | ---------------------- |
| API-001 | POST   | `/auth/register`                   | Self-register                      | Anonymous                   | None                   |
| API-002 | POST   | `/auth/login`                      | Authenticate                       | Anonymous                   | None                   |
| API-003 | POST   | `/auth/refresh`                    | Rotate session                     | Any (expired-access holder) | Refresh token          |
| API-004 | POST   | `/auth/logout`                     | End session                        | Any                         | Authenticated          |
| API-005 | POST   | `/auth/password-reset/request`     | Request reset                      | Anonymous                   | None                   |
| API-006 | POST   | `/auth/password-reset/confirm`     | Complete reset                     | Anonymous                   | Reset token            |
| API-007 | GET    | `/me`                              | Own profile and role               | Any                         | Authenticated          |
| API-008 | PATCH  | `/me`                              | Update timezone/prefs              | Any                         | Authenticated          |
| API-009 | GET    | `/me/dashboard`                    | Role-appropriate home view         | Any                         | Authenticated          |
| API-010 | GET    | `/groups`                          | List groups in caller scope        | Any                         | Scope-filtered         |
| API-011 | GET    | `/groups/available`                | Open+Active+gender-matching groups | User                        | `role=User`            |
| API-012 | GET    | `/groups/{id}`                     | Group detail                       | Admin, staff, member        | Scope                  |
| API-013 | POST   | `/groups`                          | Create group                       | Admin                       | Admin                  |
| API-014 | PATCH  | `/groups/{id}`                     | Update name                        | Admin                       | Admin                  |
| API-015 | PATCH  | `/groups/{id}/enrollment`          | Toggle Open/Closed                 | Teacher                     | Assigned Teacher       |
| API-016 | PATCH  | `/groups/{id}/staff`               | Reassign Teacher/Assistant         | Admin                       | Admin                  |
| API-017 | PATCH  | `/groups/{id}/lifecycle`           | Archive / un-archive               | Admin                       | Admin                  |
| API-018 | DELETE | `/groups/{id}`                     | Delete group                       | Admin                       | Admin, no history      |
| API-019 | POST   | `/join-requests`                   | Submit application                 | User                        | `role=User`            |
| API-020 | GET    | `/join-requests/mine`              | Own status while pending           | User                        | Own                    |
| API-021 | GET    | `/join-requests`                   | Assistant review queue             | Assistant                   | Assigned groups        |
| API-022 | GET    | `/join-requests/{id}`              | Full applicant profile             | Assistant, Admin            | Assigned group / Admin |
| API-023 | POST   | `/join-requests/{id}/accept`       | Accept                             | Assistant                   | Assigned group         |
| API-024 | POST   | `/join-requests/{id}/reject`       | Reject                             | Assistant                   | Assigned group         |
| API-025 | GET    | `/memberships/mine`                | Own active membership              | Student                     | Own                    |
| API-026 | GET    | `/groups/{id}/memberships`         | Roster                             | Teacher, Assistant, Admin   | Assigned group         |
| API-027 | DELETE | `/memberships/{id}`                | Terminate (remove student)         | Admin                       | Admin                  |
| API-028 | GET    | `/memberships/{id}/recovery`       | View soft-deleted records          | Admin                       | Admin                  |
| API-029 | GET    | `/daily-reports/today`             | Today's report or block reason     | Student                     | Own                    |
| API-030 | POST   | `/daily-reports`                   | Submit today's report              | Student                     | Own active membership  |
| API-031 | GET    | `/daily-reports`                   | Own history, paginated             | Student                     | Own                    |
| API-032 | GET    | `/memberships/{id}/daily-reports`  | Raw report list                    | Teacher, Admin              | Assigned group         |
| API-033 | GET    | `/weekly-reports/current`          | This week's live metrics           | Student                     | Own                    |
| API-034 | POST   | `/weekly-reports/{id}/confirm`     | Confirm & finalise                 | Student                     | Own, recitation day    |
| API-035 | GET    | `/weekly-reports`                  | Own history                        | Student                     | Own                    |
| API-036 | GET    | `/memberships/{id}/weekly-reports` | Weekly history                     | Teacher, Admin              | Assigned group         |
| API-037 | GET    | `/me/performance`                  | Own commitment/progress/breakdown  | Student                     | Own                    |
| API-038 | GET    | `/groups/{id}/performance`         | Group dashboard                    | Teacher, Admin              | Assigned group         |
| API-039 | GET    | `/memberships/{id}/performance`    | Individual dashboard               | Teacher, Student, Admin     | Assigned group / own   |
| API-040 | GET    | `/groups/{id}/at-risk`             | At-risk list                       | Teacher, Admin              | Assigned group         |
| API-041 | GET    | `/me/progress`                     | Own coverage / ahzab completed     | Student                     | Own                    |
| API-042 | GET    | `/memberships/{id}/progress`       | Same, for a student                | Teacher, Admin              | Assigned group         |
| API-043 | GET    | `/quran/surahs`                    | Reference data                     | Any authenticated           | Authenticated          |
| API-044 | GET    | `/quran/hizb-boundaries`           | Hizb boundaries                    | Any authenticated           | Authenticated          |
| API-045 | GET    | `/me/payments`                     | Own derived ledger                 | Student                     | Own                    |
| API-046 | GET    | `/groups/{id}/payments`            | Ledger for a group                 | Assistant, Admin            | Assigned group         |
| API-047 | POST   | `/memberships/{id}/payments`       | Record a cycle paid                | Assistant                   | Assigned group         |
| API-048 | POST   | `/devices`                         | Register push token                | Any                         | Authenticated          |
| API-049 | DELETE | `/devices/{id}`                    | Unregister                         | Any                         | Own                    |
| API-050 | GET    | `/me/notification-preferences`     | Full category catalog + mute state | Any                         | Own                    |
| API-051 | PATCH  | `/me/notification-preferences`     | Mute/unmute a category             | Any                         | Own                    |
| API-052 | PATCH  | `/users/{id}/role`                 | Promote User→Teacher/Assistant     | Admin                       | Admin                  |
| API-053 | GET    | `/users`                           | List users for assignment          | Admin                       | Admin                  |
| API-054 | GET    | `/audit`                           | Audit log                          | Admin                       | Admin                  |

## 9. Cross-Cutting Conventions

### 9.1 Response envelope (Phase 23)

Single resource:

```json
{ "data": { "...": "..." } }
```

Collection:

```json
{ "data": [{ "...": "..." }], "pagination": { "next_cursor": "eyJ...", "has_more": true } }
```

Empty success with no body (e.g. `DELETE /devices/{id}`): `204 No Content`, no envelope. Bounded, non-paginated collection endpoints (e.g. `GET /groups`, `GET /groups/available`, `GET /groups/{id}/memberships`) return `{ "data": [...] }` without `pagination` keys. No `total` count is returned on any collection — DEC-C11's scale-agnostic posture and the absence of a sizing target mean a `COUNT(*)` on every list read would be a cost paid for no confirmed benefit; a client needing "how many" already gets `has_more` for infinite-scroll UX, which is the only use case that exists today.

### 9.2 Pagination (Phase 20)

**Cursor-based**, per SA §15 (API-X04), on every endpoint returning an unbounded collection: `GET /daily-reports`, `GET /weekly-reports`, `GET /memberships/{id}/daily-reports`, `GET /memberships/{id}/weekly-reports`, `GET /join-requests` (Assistant queue), `GET /users`, `GET /audit`.

| Param    | Type          | Default           | Notes                                                                                     |
| -------- | ------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `cursor` | opaque string | none (first page) | Base64 of `{id, sort_key}` of the last item on the previous page; never a raw offset      |
| `limit`  | integer       | 20                | Max 100; values outside `[1,100]` are clamped, not rejected — a client typo shouldn't 422 |

Response `pagination.next_cursor` is `null` when `has_more` is `false`. This resolves ISS-18.

### 9.3 Filtering (Phase 21)

Only the filters listed per endpoint in §10 are accepted; any other query parameter is silently ignored (not a `422`) so old app versions calling with an extra param never break. Named filters across the surface:

| Filter       | Type                                       | Used on                                                      |
| ------------ | ------------------------------------------ | ------------------------------------------------------------ |
| `from`, `to` | `YYYY-MM-DD`                               | Every date-ranged history endpoint                           |
| `status`     | enum, endpoint-specific                    | `/join-requests`, `/groups/{id}/payments`                    |
| `gender`     | `Male` \| `Female`                         | `/groups/available`                                          |
| `role`       | enum                                       | `/users`                                                     |
| `period`     | `week` \| `month` \| `3months` \| `custom` | Performance endpoints (§10.9); `custom` requires `from`/`to` |
| `action`     | enum                                       | `/audit`                                                     |

### 9.4 Sorting (Phase 22)

**No client-controlled sorting in MVP** — no `?sort=` parameter exists anywhere. Every list endpoint returns a single, business-mandated order, matching Rule 3 ("do not over-engineer"):

| Endpoint                                              | Fixed order                                                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/join-requests` (Assistant queue)                    | `score DESC, created_at ASC` — FR-REQ-02a, not negotiable                                                                                       |
| `/daily-reports`, `/memberships/{id}/daily-reports`   | `report_date DESC`                                                                                                                              |
| `/weekly-reports`, `/memberships/{id}/weekly-reports` | `week_start DESC`                                                                                                                               |
| `/groups`, `/groups/available`                        | `created_at DESC`                                                                                                                               |
| `/users`                                              | `created_at DESC`                                                                                                                               |
| `/audit`                                              | `occurred_at DESC`                                                                                                                              |
| `/groups/{id}/memberships` (roster)                   | `full_name ASC` (Latin collation on Arabic names, per NFR-03's Arabic-first UI but Latin/Arabic-agnostic sort — flagged, not blocking, see §16) |

### 9.5 Error contract (Phase 24)

Per SA §24, extended with a machine-readable `code` and structured `details` for field-level validation:

```json
{
  "statusCode": 422,
  "error": "VALIDATION_ERROR",
  "message": "الرجاء إدخال سبب الغياب",
  "details": [{ "field": "absence_reason", "rule": "VR-19", "message": "مطلوب عند نوع الغياب" }],
  "correlationId": "c7f1e2a4-..."
}
```

`message` is always Arabic and user-facing (API-X06). `error` is a stable machine-readable string the client can switch on (e.g. `GROUP_NOT_ELIGIBLE`, `DUPLICATE_REPORT`, `SCOPE_DENIED`) without parsing Arabic text. `details` is present only on `422`; every other status omits it. Never present, on any error, at any status code: raw Postgres error text, constraint name, stack trace, file path, or internal identifiers beyond `correlationId` (SA §24).

### 9.6 HTTP status code policy (Phase 25)

| Code  | Used for                                                                                                                                                                                                                    | Never used for                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `200` | Successful `GET`, `PATCH`, or an action `POST` that doesn't create a resource (`accept`, `reject`, `confirm`)                                                                                                               | —                                                             |
| `201` | Successful resource-creating `POST` (`register`, join-requests, daily-reports, payments, devices)                                                                                                                           | Action endpoints (use `200`)                                  |
| `204` | Successful `DELETE` with no body                                                                                                                                                                                            | —                                                             |
| `400` | Malformed request body (unparseable JSON) — rare, since DTO validation catches almost everything as `422`                                                                                                                   | Business/field validation (use `422`)                         |
| `401` | Missing, invalid, or expired access token                                                                                                                                                                                   | Authorization failure once authenticated (use `403`)          |
| `403` | Authenticated but role- or scope-denied; identical to `404` for out-of-scope resources (NFR-20)                                                                                                                             | —                                                             |
| `404` | Resource genuinely doesn't exist _and_ the caller had a legitimate reason to look (e.g. `GET /quran/surahs/999` doesn't apply here since it's not itemised, but a malformed UUID path segment resolves to `404`, not `400`) | Masking scope denial that should be `403`'s uniform behaviour |
| `409` | State conflict: duplicate write blocked by a partial unique index, already-decided join request, already-paid cycle, already-finalised weekly report                                                                        | Validation failures (use `422`)                               |
| `422` | Business or field validation failure                                                                                                                                                                                        | State conflicts (use `409`)                                   |
| `429` | Rate limit exceeded (§9.8)                                                                                                                                                                                                  | —                                                             |
| `503` | Database unreachable                                                                                                                                                                                                        | Any application-level failure                                 |
| `500` | Genuinely unexpected — full detail logged server-side against `correlationId` only                                                                                                                                          | —                                                             |

### 9.7 Idempotency & concurrency (Phases 14, 31, 32)

No endpoint uses a client-supplied `Idempotency-Key` header. Every hazard SAS/DBD identified resolves to a **database constraint**, which is what makes a mobile-network retry safe by construction (API-X05):

| Endpoint                                                       | Hazard                                               | Mechanism                                                     | Retry behaviour                                                                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POST /daily-reports`                                          | Double-tap / network retry                           | `DB-UQ-04` partial unique index                               | `409`, **body includes the already-persisted report** (APIQ-09) — client treats this as success, no follow-up `GET` needed |
| `POST /join-requests`                                          | Duplicate application                                | `DB-UQ-03`                                                    | `409`, no body needed — client already has the pending request from `GET /join-requests/mine`                              |
| `POST /join-requests/{id}/accept\|reject`                      | Two Assistants act concurrently                      | `UPDATE ... WHERE status='Pending'`, 0 rows = already decided | `409`, safe no-op — second Assistant's UI refreshes to show the resolved state                                             |
| `POST /weekly-reports/{id}/confirm`                            | Double confirm, or confirm after scheduler finalised | `DB-CHK-08` trigger (`VR-36`)                                 | `409`                                                                                                                      |
| `POST /memberships/{id}/payments`                              | Two Assistants record the same cycle                 | `DB-UQ-06`                                                    | `409`                                                                                                                      |
| `POST /devices`                                                | Re-registering the same token                        | `VR-29` — refreshes `last_seen_at` rather than duplicating    | `200`, not `201` — this endpoint is genuinely idempotent, not merely constraint-guarded                                    |
| `DELETE /memberships/{id}`                                     | Double-terminate                                     | Already `Terminated` state check                              | `409`                                                                                                                      |
| `PATCH /groups/{id}/lifecycle` (archive) vs. concurrent accept | Accept-into-archived-group race                      | `SERIALIZABLE` isolation (DBD §27)                            | Accept loses the race → `409` "group archived"                                                                             |

`PATCH` endpoints (`/me`, `/groups/{id}`, notification preferences) are naturally idempotent — repeating the same body produces the same end state, last-write-wins, no special handling needed.

### 9.8 Rate limiting (Phase 33)

Per SA §15 (`NFR-22`), confirmed scope for MVP — no numeric limits invented beyond what SA already stated as a category-level decision:

| Scope                   | Endpoint(s)           | Reason                                                                                                      |
| ----------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Authentication          | `/auth/*`             | Credential stuffing (ISS-19 adjacent)                                                                       |
| Join request submission | `POST /join-requests` | ISS-19 — no cooldown exists at the business-rule level, so this is the only backstop against queue-flooding |

No other endpoint is throttled for MVP. `429` response uses the standard error envelope with `error: "RATE_LIMITED"`.

### 9.9 Auditability (Phase 35)

Exactly the three actions SAS §21 confirmed (`DEC-D05`) write an `AuditEntry`, visible only via `GET /audit`: `LOGIN` (on `/auth/login` and `/auth/register`), `GROUP_CREATED` (`POST /groups`), `ENROLLMENT_TOGGLED` (`PATCH /groups/{id}/enrollment`). No other endpoint writes to `audit_entries` — this is a conscious, documented gap (RISK-08), not an oversight; payment recording and student removal remain unaudited exactly as SAS left them.

## 10. Endpoint Definitions

### 10.1 Authentication (API-001…006)

**`POST /auth/register`**

| Field          | Type   | Required | Validation                                                                           |
| -------------- | ------ | -------- | ------------------------------------------------------------------------------------ |
| `email`        | string | Yes      | RFC-5322, unique (VR-01)                                                             |
| `password`     | string | Yes      | ≥ 8 chars (VR-02)                                                                    |
| `timezone`     | string | No       | IANA id; if absent/invalid, defaults to center timezone, flagged for refresh (VR-28) |
| `device_token` | string | No       | Optional (APIQ-07) — register separately via `POST /devices` if omitted              |

Response `201`: `{ id, role: "User", email, timezone, access_token, refresh_token }`. Side effects: `AuditEntry(LOGIN)`. Errors: `409 EMAIL_TAKEN`, `422` on format/strength failure.

**`POST /auth/login`** — same request shape minus `password`'s strength check (just presence). Response `200`: `{ id, role, full_name?, gender?, timezone, access_token, refresh_token, dashboard_route }`. `dashboard_route` is a client-routing hint derived from `role` (e.g. `student`, `assistant`) so the app doesn't need its own role→screen switch duplicated from the server's. Errors: `401 INVALID_CREDENTIALS` (uniform for wrong password _and_ unknown email — no enumeration).

**`POST /auth/refresh`** — Request: `{ refresh_token }`. Response `200`: `{ access_token, refresh_token }` (new rotated pair). Errors: `401` if hash unknown, expired, or already-revoked (**reuse detected → revokes entire chain**, SA §13).

**`POST /auth/logout`** — Request: `{ refresh_token }`. Response `204`. Sets `revoked_at`. Errors: `401`.

**`POST /auth/password-reset/request`** — Request: `{ email }`. Response: always `202`, always identical body, regardless of whether the email exists (EC-05, anti-enumeration).

**`POST /auth/password-reset/confirm`** — Request: `{ token, new_password }`. Response `200`. Side effect: revokes every outstanding refresh token for that user. Errors: `400 INVALID_OR_EXPIRED_TOKEN`, `422` on password strength.

### 10.2 Me / Identity (API-007…008)

**`GET /me`** → `{ id, role, email, full_name, gender, timezone }` (`full_name`/`gender` are `null` until first enrollment acceptance). No `password_hash`, ever.

**`PATCH /me`** — Request: `{ timezone? }`. Only `timezone` and the caller's own row are writable here; `role`, `full_name`, `gender` are never client-settable (they change only through enrollment/administration flows). Errors: `422 INVALID_TIMEZONE`.

### 10.3 Dashboard (API-009) — resolves APIQ-01

**`GET /me/dashboard`** — one call, response shape keyed by the caller's own role (a discriminated union; the client already knows its own role from login, so no `type` field guessing is needed beyond trusting the session):

| Role        | Payload                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`      | `{ has_pending_request: boolean, pending_request_status?: "Pending" }` — join entry point or status only (DEC-C09)                                          |
| `Student`   | `{ can_submit_today: boolean, block_reason?, commitment_score, payment: { status, next_due_date, arrears_count } }`                                         |
| `Assistant` | `{ pending_request_count, groups: [{ id, name, payment_followup_count }] }` — **no performance data** (DEC-B09)                                             |
| `Teacher`   | `{ groups: [{ id, name, commitment_average, at_risk_count, submission_rate }] }`                                                                            |
| `Admin`     | `{ group_count, staff_count, student_count, pending_recovery_count }` — thin, since Admin's real workflow is list-based navigation, not a metrics dashboard |

This single endpoint answers UC-02 in one round trip per SA §20's mandate. Drill-down (full history, a specific group's detail, a specific student) uses the per-resource endpoints in §10.6–10.9. Internally it composes reads from the Performance, Progress, and Payments modules (§9's module ownership is unchanged — this is an API-layer aggregation only, not a new domain concept).

### 10.4 Groups (API-010…018)

| Field                        | Type             | Required           | Validation                                            |
| ---------------------------- | ---------------- | ------------------ | ----------------------------------------------------- |
| `name`                       | string           | Yes (create)       | Unique, 409 on duplicate (APIQ-05, resolves DB-UQ-11) |
| `gender`                     | `Male`\|`Female` | Yes (create)       | VR-23                                                 |
| `recitation_day`             | integer 1–7      | Yes (create)       | Write-once (VR-25) — absent on `PATCH /groups/{id}`   |
| `teacher_id`, `assistant_id` | UUID             | Yes (create/staff) | Must hold the matching role (VR-24)                   |

`GET /groups` — no query filters; scope-filtered server-side per caller. Envelope `{ "data": [...] }`, fixed sort `created_at DESC` (§9.4). Admin/Teacher/Assistant receive full item shape: `{ "id", "name", "gender", "recitation_day", "enrollment_status", "lifecycle_state", "teacher": { "id", "full_name" }, "assistant": { "id", "full_name" } }` (APIQ-NEW-03). Student receives limited item shape: `{ "id", "name", "recitation_day", "enrollment_status" }` wrapped in a 0-or-1 item array. User receives `200` with `{ "data": [] }` (client routes to `/groups/available`).
`GET /groups/available?gender=` — `gender` required for User callers; server still re-derives it from the caller's session if a Student/other role somehow calls it, ignoring a mismatched query value rather than trusting it.
`GET /groups/{id}` → full detail for Admin/staff; Student sees `{ id, name, recitation_day, enrollment_status }` only (§14.2 — no staff identities beyond what's needed).

`POST /groups` → `201`, creates `enrollment_status='Closed'`, `lifecycle_state='Active'` (FR-GRP-01), writes `AuditEntry(GROUP_CREATED)`. Errors: `422` missing recitation day or unqualified staff, `409` duplicate name.
`PATCH /groups/{id}` → name only. `PATCH /groups/{id}/enrollment` → `{ enrollment_status: "Open"|"Closed" }`, Teacher-only, writes `AuditEntry(ENROLLMENT_TOGGLED)`. Errors: `403` unassigned Teacher (AC-17), no-op if group is `Archived` (BR-42, still `200`, response reflects unchanged state — not an error, since the caller's intent was harmless).
`PATCH /groups/{id}/staff` → `{ teacher_id?, assistant_id? }`, Admin-only, atomic (FR-GRP-03). Errors: `422` role mismatch (VR-24), `409` if replacement is the same user (no-op, not an error — returns `200`).
`PATCH /groups/{id}/lifecycle` → `{ lifecycle_state: "Active"|"Archived" }`. Archiving cascades: auto-rejects pending join requests, blocks reporting, stops payment advancement (UC-13). Un-archiving does **not** revive rejected requests.
`DELETE /groups/{id}` → `204`. Errors: `409 GROUP_HAS_HISTORY` if any Membership ever existed (BR-43, VR-30).

### 10.5 Join Requests (API-019…024)

**`POST /join-requests`** — request body:

| Field                                             | Type                                   | Required | Validation                                                                           |
| ------------------------------------------------- | -------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `group_id`                                        | UUID                                   | Yes      | Target group must be `Open` + `Active` at submission, re-checked server-side (VR-34) |
| `full_name`, `phone_number`, `occupation`, `city` | string                                 | Yes      | VR-03, VR-05                                                                         |
| `age`                                             | integer                                | Yes      | > 0 only (no upper bound, DEC-D06)                                                   |
| `memorized_ahzab`                                 | integer[]                              | Yes      | Distinct, 1–60, cardinality 5–60 (VR-04a)                                            |
| `tajweed_level`                                   | `Beginner`\|`Intermediate`\|`Advanced` | Yes      | —                                                                                    |
| `studied_tajweed_theory`, `studied_qalun`         | boolean                                | Yes      | —                                                                                    |
| `fee_agreement`                                   | boolean                                | Yes      | Must be `true` (VR-06)                                                               |
| `program_goal`                                    | `Memorization`                         | Yes      | Any other value blocked with explanation (VR-07)                                     |

Server re-validates gender against the target group (VR-08) — the client's own gender declaration is never trusted as the final word. Response `201`: `{ id, status: "Pending", score, created_at }` — **the caller gets their own score back at submission time only**, since it's their own action's direct result; `GET /join-requests/mine` afterward does **not** re-expose it (§10.5 note below). Side effect: notifies the group's Assistant (N-05). Errors: `409` already has a `Pending` request or an Active Membership (VR-09); `409 GROUP_UNAVAILABLE` if the group closed/archived since the list was loaded (EC-09); `422` fewer than 5 ahzab, goal ≠ Memorization, fee not agreed, gender mismatch.

**`GET /join-requests/mine`** → `{ status: "Pending"|"Accepted"|"Rejected" }` **only** — no `score`, no full profile echo, at any point, even after a terminal decision (DEC-C09, applies to the applicant's own view for the request's entire lifecycle, not just while pending). Returns `404 NOT_FOUND` if the caller has never submitted a join request (APIQ-NEW-06). Note that `Accepted` status is never observable in practice via this endpoint because acceptance atomically promotes the caller to `Student` role (DS-01).

**`GET /join-requests?status=pending`** (Assistant queue) → array of `{ id, full_name, score, created_at }`, fixed sort `score DESC, created_at ASC` (§9.4). No `email`, no `phone_number`, no `age`/`occupation`/`city` in the **list** view — those appear only in the single-record detail.

**`GET /join-requests/{id}`** (Assistant/Admin, full profile) → every `ApplicantProfile` field **except `email`** (APIQ-04, overrides the earlier recommendation — Naim Benjedou declined it). `phone_number`, `age`, `occupation`, `city`, `memorized_ahzab`, `tajweed_level`, `studied_tajweed_theory`, `studied_qalun`, `score` are all included. Errors: `403`/`404` uniform if outside the Assistant's assigned groups.

**`POST /join-requests/{id}/accept`** → `200`, `{ membership_id }`. Side effects (one transaction, AR-04): `User.role → Student`, `full_name`/`gender` copied onto `User`, `Membership` created, `MemorizationCoverage` seeded, N-03 notification. Errors: `409 ALREADY_DECIDED` (0-row guard), `409 APPLICANT_NO_LONGER_ELIGIBLE` (already has an Active Membership elsewhere, EC-15 adjacent).

**`POST /join-requests/{id}/reject`** → `200`. No reason captured (FR-REQ-06). Errors: `409 ALREADY_DECIDED`.

### 10.6 Memberships (API-025…028)

**`GET /memberships/mine`** → `{ id, group: { id, name, recitation_day, enrollment_status }, started_at, state }`, Student's own **Active** membership only — a terminated membership never appears here again, even to its former holder (§14.2). Returns `404 NOT_FOUND` if the caller has no active membership (APIQ-NEW-06).

**`GET /groups/{id}/memberships`** (roster) → array of `{ id, user: { id, full_name, gender }, started_at, state }`. Teacher/Assistant see their assigned group's roster; historical (terminated) rows appear **only** when the caller supplies `?as_of=` a past date (period-aware, FR-PERF-09/DEC-C04) — the default (no `?as_of=`) is current-roster-only, matching the "Teacher sees a removed student in a historical period but not the current week" rule from SAS §20.2.

**`DELETE /memberships/{id}`** → `200`, `{ membership_id, state: "Terminated" }` (soft operation, not `204`, since the response confirms the resulting state rather than signalling nothing-to-return). Side effects: cascade soft-delete of reports/weekly-reports/payments/join-request, `User.role → User`, N-08. Errors: `403 CANNOT_REMOVE_SELF` (FR-ADMIN-02 — though Admin removing a Student is a different actor than the Admin removing themselves; this guards the Admin-removes-Admin edge case which structurally can't occur but is guarded anyway), `409 ALREADY_TERMINATED`.

**`GET /memberships/{id}/recovery`** (Admin) → `{ membership, daily_reports: [...], weekly_reports: [...], payment_records: [...] }` — full soft-deleted dump, **read-only JSON, no export/download format** (APIQ-08, DBQ-04). No write path exists on this endpoint or anywhere else that clears `deleted_at`.

### 10.7 Daily Reports (API-029…032)

**`GET /daily-reports/today`** → `{ can_submit: boolean, block_reason?: "already_submitted"|"recitation_day"|"group_archived"|"membership_inactive", existing_report? }` — must return the blocking reason so the client renders correct state without inferring it (SAS §23 API-05 note).

**`POST /daily-reports`** — request body varies by `type`:

| Field                                                 | Type                           | Required when                                  | Validation                                                                                 |
| ----------------------------------------------------- | ------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `type`                                                | `Normal`\|`Absent`\|`Revision` | Always                                         | —                                                                                          |
| `absence_reason`                                      | `Sick`\|`Studying`\|`Other`    | `type=Absent`                                  | VR-19                                                                                      |
| `memo_range` (`{from:{surah,ayah}, to:{surah,ayah}}`) | object                         | Optional, `Normal` only                        | VR-13, VR-14, VR-14a — mushaf order within the report; direction across days unconstrained |
| `memo_time` (`{from, to}`)                            | object                         | Required iff `memo_range` present              | VR-15, VR-16                                                                               |
| `completed_50_repetitions`                            | boolean                        | `Normal` with `memo_range`                     | —                                                                                          |
| `repetitions_in_single_session`                       | boolean                        | Only `true` if `completed_50_repetitions=true` | VR-18                                                                                      |
| `rev_range`, `rev_time`                               | object                         | `Normal` (optional) / `Revision` (required)    | VR-17, VR-20                                                                               |
| `read_tafsir`                                         | boolean                        | Optional, `Normal` only                        | Informational only (ISS-12)                                                                |

A `Normal` report with neither `memo_range` nor `rev_range` is **valid** (BR-48) — both count as misses, not a validation error. Response `201`: `{ id, report_date, type, ahzab_completed, coverage_updated: boolean }` — the response includes the **post-submission** `ahzab_completed` figure so the client can show updated progress without a second call. Errors: `409 DUPLICATE_REPORT` — **body includes the full existing report** so a retried request is a safe, informative no-op (APIQ-09); `422 RECITATION_DAY` (VR-12); `422 BACKDATED` (VR-10, no grace period); `422` any field-level failure above; `403` group archived or membership inactive (VR-35).

**`GET /daily-reports?from=&to=`** — cursor-paginated, own history, `report_date DESC`.

**`GET /memberships/{id}/daily-reports?from=&to=`** — same shape, Teacher/Admin only, **Assistant gets `403` unconditionally** regardless of group assignment (DEC-B09) — this is the one place in the matrix where scope membership is irrelevant because the role itself is excluded.

### 10.8 Weekly Reports (API-033…036)

**`GET /weekly-reports/current`** → `{ id?, week_start, week_end, expected_days, missed_daily_reports, missed_daily_memorization, missed_daily_revision, missed_50_repetitions, missed_single_session, attended_recitation_call, state, can_confirm: boolean }`. Computed live (never stored) until finalisation (ADR-003) — `id` is `null` and `can_confirm` is `false` on every day except the recitation day itself.

**`POST /weekly-reports/{id}/confirm`** — request: `{ attended_recitation_call: boolean }`. Response `200`: the finalised report, metrics now snapshotted. Errors: `422 NOT_RECITATION_DAY` (VR-21), `409 ALREADY_FINALISED` (VR-36).

**`GET /weekly-reports?from=&to=`** and **`GET /memberships/{id}/weekly-reports`** — same pagination/scope pattern as daily reports; **Assistant: `403` unconditionally**.

### 10.9 Performance (API-037…040)

All four accept `?period=week|month|3months|custom&from=&to=` (`custom` requires `from`/`to`). Every rate in every response below is **nullable** (DEC-B04/API-X07) — never `0` when undefined.

**`GET /me/performance?period=`** → `{ commitment_score, submission_rate, memorization_rate, revision_rate, attendance_rate, repetition_quality, day_breakdown: { normal, revision, absent_excused, absent_other, no_report }, days_since_last_report }`.

**`GET /groups/{id}/performance?period=`** → `{ commitment_average, students: [{ membership_id, full_name, commitment_score }] (weakest-first), absence_breakdown, submission_rate }`. Member set includes terminated memberships whose active window intersects the period (FR-PERF-09) **except** when `period` resolves to the current week, where terminated members are excluded entirely (FR-PERF-10).

**`GET /memberships/{id}/performance?period=`** → same shape as `/me/performance`, for Teacher (assigned group) or the Student themself.

**`GET /groups/{id}/at-risk`** → `[{ membership_id, full_name, days_since_last_report }]` — the AtRisk predicate (§18.4 SAS): 3 consecutive expected days with no report, excused absences and recitation days breaking/skipping the streak respectively, terminated memberships excluded entirely.

Errors on all four: **Assistant receives `403` on every one, unconditionally** (DEC-B09) — this is repeated deliberately rather than left implicit, since it's the single most consequence-bearing scope rule in the whole system.

### 10.10 Progress & Quran Reference (API-041…044)

**`GET /me/progress`** / **`GET /memberships/{id}/progress`** → `{ ahzab_completed, coverage_percent, last_memorized_position: { surah, ayah, ordinal }, is_activity_pointer_only: true }` — the `is_activity_pointer_only` flag is included explicitly in the payload (not just documented) so the mobile client cannot accidentally render `last_memorized_position` as linear progress under non-linear memorization (DEC-D02) without the API itself carrying the warning.

**`GET /quran/surahs`** → `[{ number, name_ar, ayah_count, ordinal_offset }]`. **`GET /quran/hizb-boundaries`** → `[{ hizb_number, start: {surah,ayah}, end: {surah,ayah} }]`. Both: `Cache-Control: public, max-age=604800` (7 days) — static reference data, ADR-031. No pagination — full dataset (114 / 60 rows) is small enough to return whole.

### 10.11 Payments (API-045…047)

**`GET /me/payments`** → `{ cycles: [{ index, start_date, end_date, status: "Paid"|"Due Soon"|"Unpaid", paid_at? }], next_due_date, arrears_count }` — fully **derived** at read time (ADR-006), nothing stored beyond `PaymentRecord` rows for paid cycles.

**`GET /groups/{id}/payments?status=`** — same per-student ledgers for a group, filterable by `status`. **Teacher: `403` unconditionally** (SRS §10).

**`POST /memberships/{id}/payments`** — request: `{ cycle_index }`. Response `201`: `{ id, cycle_index, amount: 30, paid_at, recorded_by }`. Errors: `409 CYCLE_ALREADY_PAID` (VR-26), `422 FUTURE_CYCLE` (VR-37 — `cycle_index` must be ≤ the current derived cycle), `403` wrong group. **No correction/reversal endpoint exists** (APIQ-02, ISS-02 remains an accepted MVP gap) — a mis-recorded payment currently has no API-level remedy.

### 10.12 Notifications (API-048…051)

**`POST /devices`** — request: `{ token, platform: "iOS"|"Android" }`. Response `200` (not `201` — re-registration refreshes rather than creates, VR-29, genuinely idempotent). **`DELETE /devices/{id}`** → `204`, physical delete (the one confirmed hard-delete exception, DBD §25).

**`GET /me/notification-preferences`** → full catalog merged with the caller's rows (APIQ-10): `[{ category, description, is_mutable, muted }]` — every category from `notification_categories` appears, `muted` defaults to `false` for any category with no `notification_preferences` row (R-15's "absent = unmuted").

**`PATCH /me/notification-preferences`** — request: `{ category, muted }`. Errors: `422 ACCOUNT_CRITICAL_CATEGORY` if `is_mutable=false` for that category (VR-38, N-03/N-04/N-08 can never be muted).

### 10.13 Administration (API-052…054)

**`PATCH /users/{id}/role`** — request: `{ role: "Teacher"|"Assistant" }`. Errors: `422 SOURCE_ROLE_NOT_USER` (BR-R03 — target must currently hold exactly `role=User`), `403 CANNOT_PROMOTE_SELF` (FR-ADMIN-02).

**`GET /users?role=`** → `[{ id, email, full_name, role }]` — for populating the staff-assignment picker on group create/reassign.

**`GET /audit?action=&from=&to=`** → cursor-paginated `[{ id, actor: {id, full_name}, action, target_type, target_id, occurred_at }]`. Exactly the three actions in §9.9 ever appear here — this is not a general-purpose audit log, and the response never grows to include more without a corresponding SAS-level decision to expand `DEC-D05`.

## 11. DTO / Domain Model Separation (Phase 30)

No endpoint returns a domain entity or ORM row directly. Three systematic differences between domain/persistence shape and API shape:

| Domain / DB                                                                      | API DTO                                                                                                       | Why                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users.password_hash`                                                            | Never present in any DTO                                                                                      | Security — never leaves the database (SA §25)                                                                                                                        |
| `join_requests.memorized_hizb_count` (SMALLINT, a count)                         | `memorized_ahzab` (integer array, the actual selected hizb numbers) on **write**; not returned on read at all | The count is a DB-layer derived cache (DBD §31 note on 3NF departure); the API only ever needs the _set_ to seed coverage, and never needs to echo the count back    |
| `memorization_coverage` + `coverage_intervals` (two tables, a full interval set) | `{ ahzab_completed, coverage_percent, last_memorized_position }` (three derived scalars)                      | The raw interval set (§17.6 SAS) is an internal derivation structure; no client screen ever needs the disjoint-interval list itself, only the figures folded from it |
| `daily_reports.memo_from_ordinal` / `memo_to_ordinal` (global ordinal integers)  | `memo_range: { from: {surah, ayah}, to: {surah, ayah} }` (surah/ayah pairs)                                   | Ordinals are an internal computation convenience (§17.6); the mobile UI works in surah/ayah, never in raw ordinal space                                              |

General rule: every response is built by an application-layer mapper, never a direct entity serialization — this mirrors SA §16's `DomainEntity ↛ OrmEntity` boundary one layer further out (`DomainEntity ↛ ResponseDTO`).

## 12. Endpoint Examples (Phase 37)

**Submit a daily report**

```
POST /api/v1/daily-reports
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json

{
  "type": "Normal",
  "memo_range": { "from": {"surah": 2, "ayah": 1}, "to": {"surah": 2, "ayah": 20} },
  "memo_time": { "from": "18:00", "to": "18:45" },
  "completed_50_repetitions": true,
  "repetitions_in_single_session": true,
  "rev_range": { "from": {"surah": 1, "ayah": 1}, "to": {"surah": 1, "ayah": 7} },
  "rev_time": { "from": "19:00", "to": "19:10" },
  "read_tafsir": false
}
```

```
201 Created
{ "data": { "id": "01931...", "report_date": "2026-08-13", "type": "Normal", "ahzab_completed": 4, "coverage_updated": true } }
```

Retried after a timeout (same day, same membership):

```
409 Conflict
{
  "statusCode": 409, "error": "DUPLICATE_REPORT",
  "message": "لقد قمت بإرسال تقرير اليوم مسبقاً",
  "existing_report": { "id": "01931...", "report_date": "2026-08-13", "type": "Normal", "...": "..." },
  "correlationId": "c7f1e2a4-..."
}
```

**Accept a join request**

```
POST /api/v1/join-requests/01932.../accept
Authorization: Bearer eyJhbGciOi...
```

```
200 OK
{ "data": { "membership_id": "01933..." } }
```

**Own dashboard (Student)**

```
GET /api/v1/me/dashboard
Authorization: Bearer eyJhbGciOi...
```

```
200 OK
{
  "data": {
    "can_submit_today": true,
    "commitment_score": 78.4,
    "payment": { "status": "Due Soon", "next_due_date": "2026-08-20", "arrears_count": 0 }
  }
}
```

## 13. Traceability

### 13.1 Use Case → API (Phase 40)

| Use Case | Endpoint(s)                                          | Application Operation                       | Domain                            | Database                                                                                   |
| -------- | ---------------------------------------------------- | ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| UC-01    | `POST /auth/register`, `/login`                      | Register / Login                            | Identity                          | `users`, `auth_tokens`                                                                     |
| UC-02    | `GET /me/dashboard`                                  | ComposeDashboard                            | Performance / Progress / Payments | reads across `daily_reports`, `weekly_reports`, `payment_records`, `memorization_coverage` |
| UC-03    | `POST /join-requests`                                | SubmitJoinRequest                           | JoinRequest                       | `join_requests`, `join_request_ahzab`                                                      |
| UC-04    | `GET /join-requests`, `POST .../accept\|reject`      | ReviewJoinRequest, DS-01 EnrollmentService  | JoinRequest → Membership          | `join_requests`, `memberships`, `users`, `memorization_coverage`                           |
| UC-05    | `GET /daily-reports/today`, `POST /daily-reports`    | SubmitDailyReport                           | DailyReport                       | `daily_reports`                                                                            |
| UC-06    | `GET /weekly-reports/current`, `POST .../confirm`    | ConfirmWeeklyReport, DS-02                  | WeeklyReport                      | `weekly_reports`                                                                           |
| UC-07    | `GET /groups/{id}/performance`, `/at-risk`           | ComputeGroupPerformance, DS-04              | Performance                       | reads `memberships`, `daily_reports`, `weekly_reports`                                     |
| UC-08    | `GET /memberships/{id}/performance`                  | ComputeStudentPerformance, DS-03            | Performance                       | same                                                                                       |
| UC-09    | `GET /me\|groups/{id}/payments`, `POST .../payments` | DS-06 PaymentCycleDerivation, RecordPayment | Payments                          | `payment_records`                                                                          |
| UC-10    | `POST /groups`, `PATCH .../staff`                    | CreateGroup, PromoteUser                    | Groups / Identity                 | `groups`, `users`                                                                          |
| UC-11    | `PATCH /groups/{id}/staff`                           | DS-08 GroupStaffReassignmentService         | Groups                            | `groups`                                                                                   |
| UC-12    | `DELETE /memberships/{id}`                           | RemoveStudentUseCase                        | Memberships                       | `memberships` + 4-table cascade                                                            |
| UC-13    | `PATCH /groups/{id}/lifecycle`                       | DS-07 GroupArchivalService                  | Groups                            | `groups`, bulk `join_requests` reject                                                      |
| UC-14    | `PATCH /groups/{id}/enrollment`                      | ToggleEnrollment                            | Groups                            | `groups`                                                                                   |
| UC-16    | `GET /memberships/{id}/recovery`                     | RecoveryView                                | Memberships                       | read-only, `deleted_at IS NOT NULL` rows                                                   |
| UC-17    | `PATCH /users/{id}/role`                             | PromoteUser                                 | Identity                          | `users`                                                                                    |
| UC-18    | `GET/PATCH /me/notification-preferences`             | UpdatePreferences                           | Notifications                     | `notification_preferences`                                                                 |

UC-15 (Dispatch Daily Reminder) has no endpoint — it's scheduler-triggered, not client-invoked, per SA §19 (`DailyReminderEvaluationJob`).

### 13.2 API → Domain → Database (Phase 41)

Every endpoint in §10 reads or writes exactly the tables named in its "Side effects" / description line above — none introduces a write path DBD's 18-table catalogue (+`auth_tokens`, SA §13) doesn't already define. No endpoint here required a schema change; §11's DTO mappers absorb every domain/API shape difference without touching persistence.

## 14. OpenAPI Structure (Phase 38 — logical shape, not the generated YAML)

```
openapi: 3.1.0
info: { title: Irtaki API, version: 1.0.0 }
servers: [ { url: /api/v1 } ]
tags: [ Auth, Me, Dashboard, Groups, JoinRequests, Memberships, DailyReports,
        WeeklyReports, Performance, Progress, Payments, Notifications, Administration ]
paths: { ...54 paths from §8, one operationId per API-0xx ID... }
components:
  schemas:
    ErrorEnvelope, PaginationMeta,
    User, Group, Membership, JoinRequest, JoinRequestSummary, ApplicantProfile,
    DailyReport, DailyReportInput, WeeklyReport, PerformanceSummary,
    ProgressSummary, PaymentLedger, PaymentCycle, NotificationPreference,
    DashboardUser, DashboardStudent, DashboardAssistant, DashboardTeacher, DashboardAdmin
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }
  responses:
    Unauthorized401, Forbidden403, NotFound404, Conflict409, ValidationError422, RateLimited429
  parameters:
    CursorParam, LimitParam, FromDateParam, ToDateParam, PeriodParam
```

The five `Dashboard*` schemas in `components.schemas` are a `oneOf` discriminated by the caller's role, matching §10.3's table — generating the actual YAML is deferred until this document is baselined, per the governing brief's Rule 2 (no implementation artifacts yet).

## 15. API Design Decisions

Resolutions from the confirmed question batch, recorded ADR-style:

| ID          | Decision                                                                                                                                                                                                              | Status                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **APIQ-01** | `GET /me/dashboard` added as a genuine aggregation endpoint spanning Performance/Progress/Payments, per SA §20's one-round-trip mandate. Per-resource endpoints remain for drill-down.                                | **Confirmed**              |
| **APIQ-02** | No payment correction/reversal endpoint in MVP. `POST /memberships/{id}/payments` stays write-once. ISS-02 remains an accepted, open operational gap.                                                                 | **Confirmed**              |
| **APIQ-03** | Staff reassignment (`PATCH /groups/{id}/staff`) transfers full historical group visibility immediately and completely — no period-scoped access, no `group_staff_assignments` history table. ISS-04 remains accepted. | **Confirmed**              |
| **APIQ-04** | `GET /join-requests/{id}` does **not** include the applicant's `email`. This overrides the recommended default from Batch 1 — ISS-11 is resolved as "restrict," not "permit."                                         | **Confirmed (overridden)** |
| **APIQ-05** | `groups.name` uniqueness is enforced; `POST/PATCH /groups` return `409` on duplicate. Resolves DB-UQ-11 as Confirmed, not merely Recommended.                                                                         | **Confirmed**              |
| **APIQ-06** | URI versioning, `/api/v1/...`. New major version only on breaking changes.                                                                                                                                            | **Confirmed**              |
| **APIQ-07** | `device_token` is optional on `/auth/register` and `/auth/login`; `POST /devices` is the canonical registration path.                                                                                                 | **Confirmed**              |
| **APIQ-08** | Admin recovery (`GET /memberships/{id}/recovery`) returns JSON only — no CSV/PDF export endpoint in MVP.                                                                                                              | **Confirmed**              |
| **APIQ-09** | `409 DUPLICATE_REPORT` on `POST /daily-reports` includes the existing report in the error body.                                                                                                                       | **Confirmed**              |
| **APIQ-10** | `GET /me/notification-preferences` returns the full category catalog merged with the caller's preference rows, defaulting absent rows to unmuted.                                                                     | **Confirmed**              |

## 16. Open Questions

All Critical/High-severity items were already resolved upstream (SAS §29.1: zero Critical, zero High). Nothing below blocks implementation of this API contract; each is inherited or newly surfaced at the API layer specifically.

| ID              | Issue                                                                                                                                                                                                                                                                                                                                                        | Inherited from | Status                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------ |
| ISS-02          | No payment correction path                                                                                                                                                                                                                                                                                                                                   | SAS/DBD        | Confirmed accepted for MVP (APIQ-02)                                                                   |
| ISS-04          | Staff reassignment grants immediate full historical visibility                                                                                                                                                                                                                                                                                               | SAS/DBD        | Confirmed accepted for MVP (APIQ-03)                                                                   |
| ISS-11          | Applicant email visibility to Assistant                                                                                                                                                                                                                                                                                                                      | SAS            | Resolved: **not** visible via the API (APIQ-04)                                                        |
| ISS-18          | Pagination for report history                                                                                                                                                                                                                                                                                                                                | SAS            | Resolved: cursor pagination, §9.2                                                                      |
| DB-UQ-11        | `groups.name` uniqueness                                                                                                                                                                                                                                                                                                                                     | DBD            | Resolved: Confirmed, enforced (APIQ-05)                                                                |
| **APIQ-NEW-01** | `/groups/{id}/memberships` roster sort (`full_name ASC`) uses a Latin collation; Arabic-name sort order may not match user expectation. Low severity — a genuine gap surfaced only at this phase, not present upstream.                                                                                                                                      | New            | Open — recommend confirming Arabic collation (`ar_TN` or ICU) at implementation, not a contract change |
| **APIQ-NEW-02** | `dashboard_route` on `POST /auth/login`'s response is a new, API-only convenience field with no SAS precedent — it duplicates information the client can derive from `role` alone. Worth confirming it's wanted before implementation, since it's the one field in this document invented purely for client convenience rather than traced to a requirement. | New            | Open — low stakes, drop it if you'd rather the client own all routing logic                            |
| **APIQ-NEW-03** | Admin/staff `GET /groups` full item shape resolved: embeds `teacher: { id, full_name }` and `assistant: { id, full_name }` reference objects, matching existing embedding pattern (`GET /audit`, `GET /groups/{id}/memberships`). Student receives limited shape (`{ id, name, recitation_day, enrollment_status }`).                                    | New            | **Resolved**                                                                                           |
| **APIQ-NEW-04** | Non-paginated collection envelope resolved: bounded collections (`/groups`, `/groups/available`, `/groups/{id}/memberships`) use `{ "data": [...] }` with no `pagination` key.                                                                                                                                                                               | New            | **Resolved**                                                                                           |
| **APIQ-NEW-06** | 404 semantics resolved for `GET /join-requests/mine` and `GET /memberships/mine` when no record exists for the caller (consistent with uniform 404 behavior across API, not 200 with null). Also clarifies that `Accepted` is unobservable via `GET /join-requests/mine` due to atomic Student role flip.                                                                                                | New            | **Resolved**                                                                                           |

## 17. API Quality Review

| Criterion                          | Assessment                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Requirement coverage**           | Every FR group and every UC-01…18 (excluding scheduler-only UC-15) has at least one endpoint (§13.1); every SAS §23 API-01…11 entry is represented, plus `POST /auth/refresh` (an addition, not a contradiction) and `GET /me/dashboard` (an addition per APIQ-01) |
| **No invented business behaviour** | Every endpoint traces to an FR/UC/ADR; the two genuinely new items (`dashboard_route`, roster collation) are flagged as open in §16, not silently shipped                                                                                                          |
| **Authorization**                  | Every endpoint appears in §6.1's matrix; Assistant's report/performance exclusion and Teacher's payment exclusion are stated per-endpoint, not just once at the top, to prevent a silent omission during implementation                                            |
| **Database alignment**             | §13.2 — no endpoint requires a schema change; §11 documents every domain/API shape difference explicitly                                                                                                                                                           |
| **Mobile usability**               | Dashboard: one call, not six-to-eight (§10.3); every list is cursor-paginated with a bounded default `limit`; every duplicate-write retry is a safe, informative `409`, not a silent failure                                                                       |
| **Error predictability**           | One envelope shape (§9.5) for every failure at every endpoint; `403`/`404` uniformly masked per NFR-20                                                                                                                                                             |
| **Extensibility**                  | New optional fields and new endpoints ship into `v1` without a version bump (§4.1); the dashboard's per-role `oneOf` shape can grow a new role variant without breaking existing ones                                                                              |

**Overall assessment:** this specification is a direct, traceable completion of SAS §23's already-substantial API analysis and SA §15's module binding — extended only where the API layer genuinely required a decision SAS left open (payment correction, staff-reassignment visibility, applicant-email visibility, dashboard aggregation, group-name uniqueness), each resolved through the APIQ-01…10 confirmation in §15. No business rule was invented; the two newly-surfaced items in §16 are logged, not silently decided.

---

_End of document._
