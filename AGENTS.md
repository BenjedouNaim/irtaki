# AGENTS.md — Irtaki

This file orients any coding agent working in this repository. It follows the same rule every document in `docs/` follows: **it introduces no new business rule, contract, or decision.** It only synthesizes and points to authority that already exists. If anything below ever conflicts with `docs/`, the doc wins — fix this file, don't trust it over the source.

If you (the agent) find this file inaccurate after a change you made, correct it in the same PR. Don't let it drift.

---

## 1. What Irtaki Is

A mobile app for managing **one** Quran memorization center in Tunisia — enrollment, group management, daily/weekly reporting, performance tracking, offline payment tracking. Single-tenant by design (no multi-center support — see §13). Data must legally stay in Tunisia; this is why hosting is self-hosted Tunisian VPS, not a foreign cloud (see §8).

Product owner: **Naim**. Team: 2–3 people, no fixed role split — everyone touches backend, mobile, and QA.

## 2. Non-Negotiables

1. **This is not a green-field project.** Every business rule, entity, endpoint, screen, and architectural decision already exists in `docs/`. Your job is implementation, not design.
2. **If something seems missing, ambiguous, or contradictory — stop and ask.** Do not infer, do not assume the "obviously sensible" behavior, do not silently fill a gap. A wrong guess here is worse than a blocked task.
3. **Never invent a feature** because it's common or "would be nice" — no chat, no online payments, no AI, no gamification, no admin features beyond what §13 lists as in-scope. See §13's full exclusion list.
4. **Conflict between two docs → the later, more specific one wins**, and this is logged, not silently picked. Precedent: `APIS.md` overrode `DBD.md` on `groups.name` uniqueness (TSQ-01/APIQ-05). If you find a new conflict, flag it the same way — don't resolve it yourself in code.
5. **`docs/` is reference-only.** Don't edit the 8 spec docs, the Development Plan, or the Bootstrap doc as a side-effect of feature work. A doc correction is its own explicit, flagged action.

## 3. Source of Truth Map

All in `docs/`, in dependency order — each was built on top of the ones before it:

| Doc | Covers | Read this before touching... |
|---|---|---|
| `SRS.md` | Requirements, actors, scope, business rules | Anything — start here if unsure what a feature is *for* |
| `SAS.md` | Full requirements catalogue, FR/BR/UC list | Any specific business rule's exact wording |
| `DMS.md` | Domain entities, aggregates, invariants, domain events, lifecycles | Domain layer code in any module |
| `DBD.md` | Full ERD, all 19 tables, constraints, indexes | Any migration or query |
| `SA.md` | System architecture, ADRs, module boundaries, deployment | Cross-module calls, infra choices, "can I add a dependency" |
| `APIS.md` | All 54 endpoints, request/response contracts, error codes | Any controller/DTO |
| `UF.md` | All 35 screens, component inventory, states, RTL/a11y rules | Any screen/component |
| `TS.md` | Tech stack decisions, project structure, testing strategy, coding conventions | Setup/tooling questions, "what test do I write" |
| `Irtaki-Development-Plan.md` | Epics, features, task breakdown, dependency graph, milestones | "What's next and why" |
| `Irtaki-Repo-Bootstrap.md` | Repo/CI/branch setup (historical — Sprint 0 is done) | Only if repo config itself needs to change |

## 4. Tech Stack (exact — do not substitute)

| Layer | Choice |
|---|---|
| Mobile | React Native + Expo + TypeScript |
| Backend | NestJS + TypeORM + PostgreSQL |
| Auth | In-house JWT, **argon2id** password hashing — not bcrypt |
| Email | Mailgun |
| Push | FCM via Expo |
| Hosting | Self-hosted Tunisian VPS pair, **Coolify** as deployment platform (data-residency requirement — not swappable for a foreign PaaS) |
| Backups | MinIO on a second VPS |
| API style | REST/JSON, URI-versioned, 54 endpoints / 13 resource groups |
| VCS | GitHub, manual issue creation (no automation tooling beyond CI) |

Don't add a new major dependency (state library, ORM, alternate DB, etc.) without checking `SA.md`/`TS.md` first — if it's not there, it wasn't decided, which per §2.2 means: ask, don't assume.

## 5. Repository Layout

```
backend/src/modules/{identity,groups,enrollment,memberships,reports,
                      progress,performance,payments,notifications,administration}/
  each with: presentation/ application/ domain/ infrastructure/
backend/{migrations,seed,test}/
mobile/src/features/{auth,dashboard,groups,joinRequests,membership,
                      dailyReports,weeklyReports,performance,payments,
                      progress,notifications}/
mobile/src/features/{shared,navigation}/
docs/            ← read-only reference, see §3
.github/         ← workflows, issue/PR templates, CODEOWNERS
```

Ten backend modules, eleven mobile feature folders — matches the Development Plan's Epic structure 1:1 (§6 of the Development Plan).

## 6. Domain Cheat Sheet

Quick recall only — treat every row as a pointer, not the full definition. Exact thresholds, validation rules, and edge cases live in `DMS.md`/`SAS.md`; don't implement from memory of this table alone.

| Concept | One-line meaning | Full detail |
|---|---|---|
| Roles | Admin, Teacher, Assistant, Student, User (User = not yet a Student) | `DMS.md`, `SRS.md` |
| Riwaya | **Qālūn ʿan Nāfiʿ** — confirmed, not Hafs. Affects ayah/hizb reference data | `Irtaki-Development-Plan.md` §16, F-FND-06 |
| Ahzab / Hizb | Quran division units used for group specialization and progress tracking | `DMS.md` |
| Soft delete | Records are never hard-deleted; recovery views exist for Admin | `DBD.md`, `DMS.md` |
| Memorization coverage | Modeled as **interval sets**, not simple counters — supports forward/backward/skipped-order memorization | `DMS.md` DS-05 |
| CommitmentScore | Derived performance metric, not stored directly | `DMS.md`, `TS.md` DS-03 |
| PaymentCycle | Fixed 30 TND / 3-month cycle, **offline tracker only** — no payment processing | `SRS.md`, `DMS.md` DS-06 |
| DayClassification | Categorizes each day for weekly-metric calculation | `DMS.md`, `TS.md` §22 |
| Daily report types | Normal, Absent, Revision — conditional fields per type | `SRS.md`, `APIS.md` API-030 |
| Weekly report | Auto-calculated (6 metrics), Student-confirmed, then immutable | `TS.md` §22, DS-02 |
| Revision Period | Has its own lifecycle, distinct from a single daily report | `DMS.md` |
| At-risk predicate | 3 consecutive **expected** days with no report — excused absences break the streak | `DMS.md` DS-04 |
| Join Request / Membership | Two-entity lifecycle: Pending → Accepted (atomic, creates Membership) or Rejected | `DMS.md` ST-03/ST-04, DS-01 |

## 7. Architecture Pattern

Every backend module follows the same four-layer split — don't collapse layers "to move faster":

```
presentation/    → controllers, DTOs (transport validation)
application/     → use cases, orchestration (calls domain + infrastructure)
domain/          → entities, value objects, invariants, domain events (no I/O)
infrastructure/  → repositories, external adapters (Mailgun, FCM, TypeORM)
```

Entities ≠ database tables — domain modeling is a separate concern from schema design (`DMS.md` vs `DBD.md` are deliberately separate documents). Don't let a table's shape dictate a domain object's shape or vice versa.

Cross-module communication is **event-based**, not direct service calls, per `SA.md` §11 — e.g., Notifications subscribes to events from Groups/Enrollment/Reports/Payments, it is never called into directly.

## 8. Key ADRs You Must Not Casually Override

| ADR | Decision | Why it matters if you "simplify" it |
|---|---|---|
| Data residency | Self-hosted Tunisian VPS, not foreign cloud | Legal requirement, not a preference |
| Coverage model | Interval sets, not a simple percentage counter | A counter can't represent out-of-order or partial re-memorization |
| Report immutability | Enforced at the **DB trigger** level (BR-21/22) | App-layer-only enforcement is a silent integrity hole — a missed check elsewhere won't catch it |
| Join-request accept (DS-01) | One atomic transaction: Membership + role change + coverage seed | Splitting this across separate calls risks a half-committed state |
| Notification degradation | FCM/Mailgun failure must **never** block the triggering request | A notification is best-effort; the underlying action (e.g. submitting a report) must always succeed independently |
| Dashboard aggregation | `GET /me/dashboard` is one call, fanning out server-side | Don't let it regress into the mobile client making 6 separate calls |

## 9. Git / Commit / PR Conventions

- **Branching:** trunk-based off `main`. `feat/...`, `fix/...`, `refactor/...`, `test/...`, `docs/...`, `chore/...`
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
- **Merging:** PR → squash-merge only. No direct commits to `main`. No `develop` branch.
- **Branch protection — currently Phase A (solo):** CI must pass, no force-push, but no required approval count yet, so self-merge is fine for now. **Phase B triggers the moment a second person's GitHub account is added** — required-approval count goes to 1, `CODEOWNERS` gets their username, self-merge stops being available to anyone. If you're an agent working after that point, check `CODEOWNERS` before assuming you can merge solo.
- **PR template** already enforces the Definition of Done checklist (§10) — don't skip filling it out.

## 10. Definition of Done

A feature isn't done until:

- [ ] Implements the spec exactly — no silent scope addition or reduction
- [ ] Domain rules enforced at the **domain layer**, not just DTO validation
- [ ] API contract matches `APIS.md` exactly — method, status codes, error shape
- [ ] UI matches `UF.md`'s screen spec and shared component inventory
- [ ] All four validation layers present where applicable: transport, application, domain, database
- [ ] Authorization tested for every relevant role×resource combination, **including at least one negative test**
- [ ] Error states handled per `UF.md` §24 — no raw error, no stack trace, reaches the mobile UI
- [ ] Unit + integration + security tests pass
- [ ] Migrations (if any) reviewed, apply cleanly on a fresh database
- [ ] Traceability updated if this feature adds/closes a row in the Development Plan's tables

## 11. Testing Requirements

| Level | Tooling | Notes |
|---|---|---|
| Unit | Jest | Domain entities/VOs — no I/O |
| Integration | Jest + Supertest, **real Postgres via Docker** | Not SQLite, not mocks — DB triggers and partial unique indexes are Postgres-specific and won't be validated by a lighter substitute |
| API/Contract | Jest + Supertest | Every endpoint in `APIS.md` |
| Authorization | Jest + Supertest, parameterized | Positive + negative per role, every protected endpoint |
| Mobile component | Jest + RNTL | Mocked API client |
| Concurrency | Jest, simulated near-simultaneous requests | Named hazards: group-name race, join-request accept race, group archive race, duplicate daily report, duplicate payment cycle |
| E2E (Detox) | **Not in MVP** — Post-MVP (TDR-04) | Don't add it preemptively |

Security checklist to verify per endpoint, not just at the end of the project: `@Roles()` correctness, scope/IDOR guard, mass-assignment stripping (DTOs are allow-list, not the raw entity), rate limiting on `/auth/*` and `/join-requests`, no error-envelope leakage.

## 12. The Working Loop

1. Pick the next open GitHub Issue in the current milestone (GitHub is the live source of truth for "what's next" — not this file).
2. Branch off `main`.
3. Work the issue's checklist top to bottom, committing per checkbox.
4. Push, open PR against the issue, fill out the DoD template.
5. CI must pass. Fix and push again if not.
6. Merge (see §9 for solo-vs-team merge rules). Issue auto-closes.
7. When a milestone (Epic) hits 100%, the *next* Epic's Feature issues get created then — not earlier. Issue titles come from the Development Plan §8 Feature Catalogue; don't invent new ones.

## 13. What NOT to Build

Explicitly out of scope — do not implement even if it seems like an obvious improvement:

Online payment processing · offline mode / local sync · in-app recitation, audio, or video · Teacher grading/correction · multi-center or multi-branch support · group capacity limits · report editing or deletion after submission · chat/messaging · any notification beyond the 8 named events · any screen not in `UF.md`'s 35 · any endpoint not in `APIS.md`'s 54.

Deliberately deferred to Post-MVP — don't build early "since you're in the area": payment correction/reversal (TDR-01), staff-reassignment history (TDR-02), notification log retention policy (TDR-03), Detox E2E (TDR-04), coverage point-in-time snapshots, read replicas/materialized dashboards, role sub-typing.

Don't casually change, while "cleaning up" nearby code: the 30 TND / 3-month payment cycle values, the 3-consecutive-day at-risk threshold, the six weekly-metric formulas, the CommitmentScore weighting — these read like tunable constants but are specified business values.

## 14. When You Hit a Spec Gap

This has happened before in this project and has a house style: don't resolve it silently in code. Post a comment on the relevant GitHub issue (or the PR, if you're mid-implementation) describing exactly what's missing or contradictory, tag Naim, and wait. **ISS-14** (end-of-month payment-cycle arithmetic) is the worked example of that process running its course: it was logged rather than guessed, and is now resolved as *clamp to the last valid day of the target month*, implemented in `DS-06` (`SAS.md` §18.5, `TS.md` §25, EPIC-07 F-PAY-01). Anything still unresolved gets the same treatment — logged, not guessed.

## 15. Current Repo / Team State (snapshot — verify against GitHub, don't trust this going stale)

- Repo: `BenjedouNaim/irtaki`, private
- Team: solo (Naim) as of Sprint 0 — branch protection Phase A active
- Sprint 0 (repo bootstrap) is complete
- Riwaya (TSQ-10) is resolved: Qālūn ʿan Nāfiʿ

## 16. Quick Reference — Where to Look

| Question | Answer lives in |
|---|---|
| "What does this business rule actually say?" | `SAS.md` or `SRS.md` |
| "What's the exact API contract?" | `APIS.md` |
| "What does this screen need to show?" | `UF.md` |
| "What table/column/constraint?" | `DBD.md` |
| "Why was it built this way?" | `SA.md` (ADRs) |
| "What's next, and what does it depend on?" | `Irtaki-Development-Plan.md` |
| "What test do I need to write?" | §11 above, or `TS.md` §34–36 |
| "Is this in scope for MVP?" | §13 above, or Development Plan §4 |

---

*This file describes how to work in this repository. It does not track what's currently being worked on — that's GitHub Issues and Milestones.*