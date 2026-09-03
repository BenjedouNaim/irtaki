/**
 * F-TEST-02 — the authorization matrix, declared as data.
 *
 * This file is a **transcription of APIS §6.1**, one entry per endpoint in
 * the APIS §8 catalogue (API-001…API-054), so that a reader can diff it
 * against the document by eye: every entry carries the §6.1 row it was
 * copied from verbatim in `matrixRow`, and `cells` repeats that row's five
 * columns in the document's own column order.
 *
 * Nothing here executes. `authorization-matrix.integration.spec.ts` builds
 * the fixtures and turns each cell into assertions:
 *
 *   allowed cell  → the endpoint's documented 2xx (APIS §9.6)
 *   `—` / `🚫`    → the uniform `403` (SA §14, NFR-20)
 *   `(g)` / `own` → both: the legitimate owner succeeds, AND a *same-role*
 *                   caller who owns a different resource is refused (TS §36)
 *
 * The two inverted exclusions are asserted from `blockedBy`, which names the
 * document sentence that blocks the role, so a swap cannot pass silently:
 *   DEC-B09 excludes the **Assistant** from Reports / Weekly / Performance /
 *   Progress; SRS §10 excludes the **Teacher** from Payments.
 */

export const ROLES = [
  'Admin',
  'Teacher',
  'Assistant',
  'Student',
  'User',
] as const;

export type Role = (typeof ROLES)[number];

/**
 * APIS §6.1 legend, verbatim:
 *   ✓ allowed · **own** = own resource only · **(g)** = assigned group(s)
 *   only · — not allowed · 🚫 = explicitly blocked even though the role
 *   could technically reach it
 */
export type Cell =
  | '✓'
  | '✓ all'
  | '✓ (g)'
  | '✓ own'
  | '✓ (g, own group)'
  | '✓ (admin view)'
  | '✓ (anon. before login)'
  | '—'
  | '🚫';

/** Cells whose caller reaches the handler. Everything else is a `403`. */
const ALLOWED: readonly Cell[] = [
  '✓',
  '✓ all',
  '✓ (g)',
  '✓ own',
  '✓ (g, own group)',
  '✓ (admin view)',
  '✓ (anon. before login)',
];

export function isAllowed(cell: Cell): boolean {
  return ALLOWED.includes(cell);
}

/** Cells that name an instance restriction — "(g)" or "own". */
export function isScoped(cell: Cell): boolean {
  return cell === '✓ (g)' || cell === '✓ own' || cell === '✓ (g, own group)';
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * How instance-level scope is enforced for the route (SA §14 / TS §15.2),
 * which decides whether a *same-role, wrong-scope* caller is expressible:
 *
 * - `resource`  — the route takes a resource id, so a same-role caller who
 *                 owns a different resource can ask for this one and must be
 *                 refused. These are the cases TS §36's ScopeGuard row
 *                 requires ("one test as the legitimate owner, one as a
 *                 different, otherwise-valid staff member of a *different*
 *                 group").
 * - `list`      — no resource id; scope is the repository's `WHERE` clause
 *                 (TS §15.2 "Repository scope filter"). Every allowed caller
 *                 gets 2xx and a different row set, so there is no 403 to
 *                 assert; the per-feature suites assert the row sets.
 * - `own`       — a `/me/…`-shaped route: the caller *is* the scope, so no
 *                 caller can name another user's resource at all.
 * - `none`      — no instance dimension (Admin-only writes, reference data).
 */
export type ScopeKind = 'resource' | 'list' | 'own' | 'none';

/**
 * A cell where the running system deliberately answers something other than
 * what §6.1 says. Every one of these is reported as an open question — never
 * used to bless an implementation that simply grants too much.
 */
export interface Deviation {
  /** What the endpoint actually answers this role. */
  readonly observed: number;
  /** Which documents contradict §6.1, and why the code is left alone. */
  readonly reason: string;
  /** Extra safety assertion: the response must disclose no rows. */
  readonly assertEmptyData?: boolean;
}

export interface EndpointAuthz {
  /** APIS §8 catalogue id. */
  readonly api: string;
  readonly method: HttpMethod;
  /** Catalogue path, `{id}` where the route takes a resource id. */
  readonly path: string;
  /** The APIS §6.1 row these cells were copied from, verbatim. */
  readonly matrixRow: string;
  /** §6.1's five columns, in the document's order. */
  readonly cells: Readonly<Record<Role, Cell>>;
  readonly scope: ScopeKind;
  /** The 2xx an allowed, in-scope caller receives (APIS §9.6). */
  readonly successStatus: number;
  /** Names the sentence that blocks every `🚫` cell in this row. */
  readonly blockedBy?: string;
  /** `@Public()` — reachable with no Authorization header at all. */
  readonly isPublic?: true;
  readonly deviation?: Readonly<Partial<Record<Role, Deviation>>>;
}

/** The sentence DEC-B09 is stated in, quoted where a `🚫` cell is asserted. */
export const DEC_B09 =
  'DEC-B09 — APIS §6.1: "**Assistant\'s blanket exclusion** from Reports, ' +
  'Weekly Reports, Performance, and Progress (DEC-B09) is enforced by ' +
  "`RolesGuard` alone — Assistant simply isn't in those endpoints' " +
  '`@Roles()` list, per SA §14."';

/** The sentence SRS §10 excludes the Teacher from Payments in. */
export const SRS_10_TEACHER_PAYMENTS =
  'SRS §10 — "Payment record | Admin: R | Teacher: — | Assistant: R U (own ' +
  'groups) | Student: R (own) | User: —", reinforced by "The Teacher has ' +
  'exactly one write permission in the entire system: the enrollment toggle."';

const ALL_FIVE: Record<Role, Cell> = {
  Admin: '✓',
  Teacher: '✓',
  Assistant: '✓',
  Student: '✓',
  User: '✓',
};

const ADMIN_ONLY: Record<Role, Cell> = {
  Admin: '✓',
  Teacher: '—',
  Assistant: '—',
  Student: '—',
  User: '—',
};

/** §6.1 "Reports/Weekly/Performance/Progress — the Student's own routes". */
const STUDENT_OWN_ASSISTANT_BLOCKED: Record<Role, Cell> = {
  Admin: '—',
  Teacher: '—',
  Assistant: '🚫',
  Student: '✓ own',
  User: '—',
};

/** §6.1 "…/memberships/{id}/… — the staff read of one student's data". */
const STAFF_MEMBERSHIP_ASSISTANT_BLOCKED: Record<Role, Cell> = {
  Admin: '✓ all',
  Teacher: '✓ (g)',
  Assistant: '🚫',
  Student: '—',
  User: '—',
};

const AUTH_ROW =
  '`POST /auth/register`, `/login`, `/refresh`, `/logout`, ' +
  '`/password-reset/*` | ✓ | ✓ | ✓ | ✓ | ✓ (anon. before login)';

const AUTH_CELLS: Record<Role, Cell> = {
  Admin: '✓',
  Teacher: '✓',
  Assistant: '✓',
  Student: '✓',
  User: '✓ (anon. before login)',
};

const GROUPS_WRITE_ROW =
  '`POST /groups`, `PATCH /groups/{id}`, `/staff`, `/lifecycle`, ' +
  '`DELETE /groups/{id}` | ✓ | — | — | — | —';

const DAILY_OWN_ROW =
  '`GET /daily-reports/today`, `POST /daily-reports`, `GET /daily-reports` ' +
  '| — | — | 🚫 (DEC-B09) | ✓ own | —';

const WEEKLY_OWN_ROW =
  '`GET /weekly-reports/current`, `POST /weekly-reports/{id}/confirm`, ' +
  '`GET /weekly-reports` | — | — | 🚫 | ✓ own | —';

const NOTIFICATIONS_ROW =
  '`POST /devices`, `DELETE /devices/{id}`, ' +
  '`GET/PATCH /me/notification-preferences` | ✓ own | ✓ own | ✓ own | ' +
  '✓ own | ✓ own';

const NOTIFICATIONS_CELLS: Record<Role, Cell> = {
  Admin: '✓ own',
  Teacher: '✓ own',
  Assistant: '✓ own',
  Student: '✓ own',
  User: '✓ own',
};

const ADMINISTRATION_ROW =
  '`PATCH /users/{id}/role`, `GET /users?role=`, `GET /audit` | ✓ | — | — ' +
  '| — | —';

/**
 * All 54 endpoints × 5 roles = 270 cells.
 *
 * Order follows the APIS §8 catalogue so the ids read API-001 … API-054.
 */
export const AUTHORIZATION_MATRIX: readonly EndpointAuthz[] = [
  // ── §6.1 row 1: auth (public) ───────────────────────────────────────────
  {
    api: 'API-001',
    method: 'POST',
    path: '/auth/register',
    matrixRow: AUTH_ROW,
    cells: AUTH_CELLS,
    scope: 'none',
    successStatus: 201,
    isPublic: true,
  },
  {
    api: 'API-002',
    method: 'POST',
    path: '/auth/login',
    matrixRow: AUTH_ROW,
    cells: AUTH_CELLS,
    scope: 'none',
    successStatus: 200,
    isPublic: true,
  },
  {
    api: 'API-003',
    method: 'POST',
    path: '/auth/refresh',
    matrixRow: AUTH_ROW,
    cells: AUTH_CELLS,
    scope: 'none',
    successStatus: 200,
    isPublic: true,
  },
  {
    api: 'API-004',
    method: 'POST',
    path: '/auth/logout',
    matrixRow: AUTH_ROW,
    cells: AUTH_CELLS,
    scope: 'own',
    successStatus: 204,
  },
  {
    api: 'API-005',
    method: 'POST',
    path: '/auth/password-reset/request',
    matrixRow: AUTH_ROW,
    cells: AUTH_CELLS,
    scope: 'none',
    successStatus: 202,
    isPublic: true,
  },
  {
    api: 'API-006',
    method: 'POST',
    path: '/auth/password-reset/confirm',
    matrixRow: AUTH_ROW,
    cells: AUTH_CELLS,
    scope: 'none',
    successStatus: 200,
    isPublic: true,
  },

  // ── §6.1 row 2: `GET/PATCH /me` ─────────────────────────────────────────
  {
    api: 'API-007',
    method: 'GET',
    path: '/me',
    matrixRow: '`GET/PATCH /me` | ✓ | ✓ | ✓ | ✓ | ✓',
    cells: ALL_FIVE,
    scope: 'own',
    successStatus: 200,
  },
  {
    api: 'API-008',
    method: 'PATCH',
    path: '/me',
    matrixRow: '`GET/PATCH /me` | ✓ | ✓ | ✓ | ✓ | ✓',
    cells: ALL_FIVE,
    scope: 'own',
    successStatus: 200,
  },

  // ── §6.1 row 3: dashboard ───────────────────────────────────────────────
  {
    api: 'API-009',
    method: 'GET',
    path: '/me/dashboard',
    matrixRow: '`GET /me/dashboard` | ✓ (admin view) | ✓ | ✓ | ✓ | ✓',
    cells: { ...ALL_FIVE, Admin: '✓ (admin view)' },
    scope: 'own',
    successStatus: 200,
  },

  // ── §6.1 row 4: group reads ─────────────────────────────────────────────
  {
    api: 'API-010',
    method: 'GET',
    path: '/groups',
    matrixRow:
      '`GET /groups`, `GET /groups/{id}` | ✓ all | ✓ (g) | ✓ (g) | ' +
      '✓ (g, own group) | —',
    cells: {
      Admin: '✓ all',
      Teacher: '✓ (g)',
      Assistant: '✓ (g)',
      Student: '✓ (g, own group)',
      User: '—',
    },
    scope: 'list',
    successStatus: 200,
    deviation: {
      User: {
        observed: 200,
        assertEmptyData: true,
        reason:
          'APIS §6.1 says "—" for the User, but APIS §8 (API-010: Actor ' +
          '"Any", Auth "Scope-filtered") and SAS §23 API-02 ("List groups ' +
          'in caller scope (§14.1)", Actor "Any") both say Any — and SAS ' +
          '§14.1 gives scope(User) a non-empty group set. The two ' +
          'statements are in the same documents as the matrix, so the ' +
          'matrix cell is treated as the doubtful one and the code is left ' +
          'alone (open question). The security property §6.1\'s "—" ' +
          'protects still holds and is asserted here: the User is disclosed ' +
          'no group at all.',
      },
    },
  },
  {
    api: 'API-012',
    method: 'GET',
    path: '/groups/{id}',
    matrixRow:
      '`GET /groups`, `GET /groups/{id}` | ✓ all | ✓ (g) | ✓ (g) | ' +
      '✓ (g, own group) | —',
    cells: {
      Admin: '✓ all',
      Teacher: '✓ (g)',
      Assistant: '✓ (g)',
      Student: '✓ (g, own group)',
      User: '—',
    },
    scope: 'resource',
    successStatus: 200,
  },

  // ── §6.1 row 5: `GET /groups/available` — User only ─────────────────────
  {
    api: 'API-011',
    method: 'GET',
    path: '/groups/available',
    matrixRow: '`GET /groups/available` | — | — | — | — | ✓',
    cells: {
      Admin: '—',
      Teacher: '—',
      Assistant: '—',
      Student: '—',
      User: '✓',
    },
    scope: 'list',
    successStatus: 200,
  },

  // ── §6.1 row 6: group writes — Admin ────────────────────────────────────
  {
    api: 'API-013',
    method: 'POST',
    path: '/groups',
    matrixRow: GROUPS_WRITE_ROW,
    cells: ADMIN_ONLY,
    scope: 'none',
    successStatus: 201,
  },
  {
    api: 'API-014',
    method: 'PATCH',
    path: '/groups/{id}',
    matrixRow: GROUPS_WRITE_ROW,
    cells: ADMIN_ONLY,
    scope: 'none',
    successStatus: 200,
  },
  {
    api: 'API-016',
    method: 'PATCH',
    path: '/groups/{id}/staff',
    matrixRow: GROUPS_WRITE_ROW,
    cells: ADMIN_ONLY,
    scope: 'none',
    successStatus: 200,
  },
  {
    api: 'API-017',
    method: 'PATCH',
    path: '/groups/{id}/lifecycle',
    matrixRow: GROUPS_WRITE_ROW,
    cells: ADMIN_ONLY,
    scope: 'none',
    successStatus: 200,
  },
  {
    api: 'API-018',
    method: 'DELETE',
    path: '/groups/{id}',
    matrixRow: GROUPS_WRITE_ROW,
    cells: ADMIN_ONLY,
    scope: 'none',
    successStatus: 204,
  },

  // ── §6.1 row 7: enrollment toggle — the Teacher's only write ────────────
  {
    api: 'API-015',
    method: 'PATCH',
    path: '/groups/{id}/enrollment',
    matrixRow: '`PATCH /groups/{id}/enrollment` | — | ✓ (g) | — | — | —',
    cells: {
      Admin: '—',
      Teacher: '✓ (g)',
      Assistant: '—',
      Student: '—',
      User: '—',
    },
    scope: 'resource',
    successStatus: 200,
  },

  // ── §6.1 rows 8–11: join requests ───────────────────────────────────────
  {
    api: 'API-019',
    method: 'POST',
    path: '/join-requests',
    matrixRow: '`POST /join-requests` | — | — | — | — | ✓',
    cells: {
      Admin: '—',
      Teacher: '—',
      Assistant: '—',
      Student: '—',
      User: '✓',
    },
    scope: 'own',
    successStatus: 201,
  },
  {
    api: 'API-020',
    method: 'GET',
    path: '/join-requests/mine',
    matrixRow: '`GET /join-requests/mine` | — | — | — | — | ✓ own',
    cells: {
      Admin: '—',
      Teacher: '—',
      Assistant: '—',
      Student: '—',
      User: '✓ own',
    },
    scope: 'own',
    successStatus: 200,
  },
  {
    api: 'API-021',
    method: 'GET',
    path: '/join-requests',
    matrixRow:
      '`GET /join-requests?status=`, `GET /join-requests/{id}` | ✓ all | — ' +
      '| ✓ (g) | — | —',
    cells: {
      Admin: '✓ all',
      Teacher: '—',
      Assistant: '✓ (g)',
      Student: '—',
      User: '—',
    },
    scope: 'list',
    successStatus: 200,
  },
  {
    api: 'API-022',
    method: 'GET',
    path: '/join-requests/{id}',
    matrixRow:
      '`GET /join-requests?status=`, `GET /join-requests/{id}` | ✓ all | — ' +
      '| ✓ (g) | — | —',
    cells: {
      Admin: '✓ all',
      Teacher: '—',
      Assistant: '✓ (g)',
      Student: '—',
      User: '—',
    },
    scope: 'resource',
    successStatus: 200,
  },
  {
    api: 'API-023',
    method: 'POST',
    path: '/join-requests/{id}/accept',
    matrixRow:
      '`POST /join-requests/{id}/accept\\|reject` | — | — | ✓ (g) | — | —',
    cells: {
      Admin: '—',
      Teacher: '—',
      Assistant: '✓ (g)',
      Student: '—',
      User: '—',
    },
    scope: 'resource',
    successStatus: 200,
  },
  {
    api: 'API-024',
    method: 'POST',
    path: '/join-requests/{id}/reject',
    matrixRow:
      '`POST /join-requests/{id}/accept\\|reject` | — | — | ✓ (g) | — | —',
    cells: {
      Admin: '—',
      Teacher: '—',
      Assistant: '✓ (g)',
      Student: '—',
      User: '—',
    },
    scope: 'resource',
    successStatus: 200,
  },

  // ── §6.1 rows 12–15: memberships ────────────────────────────────────────
  {
    api: 'API-025',
    method: 'GET',
    path: '/memberships/mine',
    matrixRow: '`GET /memberships/mine` | — | — | — | ✓ own | —',
    cells: {
      Admin: '—',
      Teacher: '—',
      Assistant: '—',
      Student: '✓ own',
      User: '—',
    },
    scope: 'own',
    successStatus: 200,
  },
  {
    api: 'API-026',
    method: 'GET',
    path: '/groups/{id}/memberships',
    matrixRow: '`GET /groups/{id}/memberships` | ✓ all | ✓ (g) | ✓ (g) | — | —',
    cells: {
      Admin: '✓ all',
      Teacher: '✓ (g)',
      Assistant: '✓ (g)',
      Student: '—',
      User: '—',
    },
    scope: 'resource',
    successStatus: 200,
  },
  {
    api: 'API-027',
    method: 'DELETE',
    path: '/memberships/{id}',
    matrixRow: '`DELETE /memberships/{id}` | ✓ | — | — | — | —',
    cells: ADMIN_ONLY,
    scope: 'none',
    successStatus: 200,
  },
  {
    api: 'API-028',
    method: 'GET',
    path: '/memberships/{id}/recovery',
    matrixRow: '`GET /memberships/{id}/recovery` | ✓ | — | — | — | —',
    cells: ADMIN_ONLY,
    scope: 'none',
    successStatus: 200,
  },

  // ── §6.1 rows 16–17: daily reports (Assistant 🚫 DEC-B09) ───────────────
  {
    api: 'API-029',
    method: 'GET',
    path: '/daily-reports/today',
    matrixRow: DAILY_OWN_ROW,
    cells: STUDENT_OWN_ASSISTANT_BLOCKED,
    scope: 'own',
    successStatus: 200,
    blockedBy: DEC_B09,
  },
  {
    api: 'API-030',
    method: 'POST',
    path: '/daily-reports',
    matrixRow: DAILY_OWN_ROW,
    cells: STUDENT_OWN_ASSISTANT_BLOCKED,
    scope: 'own',
    successStatus: 201,
    blockedBy: DEC_B09,
  },
  {
    api: 'API-031',
    method: 'GET',
    path: '/daily-reports',
    matrixRow: DAILY_OWN_ROW,
    cells: STUDENT_OWN_ASSISTANT_BLOCKED,
    scope: 'own',
    successStatus: 200,
    blockedBy: DEC_B09,
  },
  {
    api: 'API-032',
    method: 'GET',
    path: '/memberships/{id}/daily-reports',
    matrixRow:
      '`GET /memberships/{id}/daily-reports` | ✓ all | ✓ (g) | 🚫 | — | —',
    cells: STAFF_MEMBERSHIP_ASSISTANT_BLOCKED,
    scope: 'resource',
    successStatus: 200,
    blockedBy: DEC_B09,
  },

  // ── §6.1 rows 18–19: weekly reports (Assistant 🚫 DEC-B09) ──────────────
  {
    api: 'API-033',
    method: 'GET',
    path: '/weekly-reports/current',
    matrixRow: WEEKLY_OWN_ROW,
    cells: STUDENT_OWN_ASSISTANT_BLOCKED,
    scope: 'own',
    successStatus: 200,
    blockedBy: DEC_B09,
  },
  {
    api: 'API-034',
    method: 'POST',
    path: '/weekly-reports/{id}/confirm',
    matrixRow: WEEKLY_OWN_ROW,
    cells: STUDENT_OWN_ASSISTANT_BLOCKED,
    scope: 'resource',
    successStatus: 200,
    blockedBy: DEC_B09,
  },
  {
    api: 'API-035',
    method: 'GET',
    path: '/weekly-reports',
    matrixRow: WEEKLY_OWN_ROW,
    cells: STUDENT_OWN_ASSISTANT_BLOCKED,
    scope: 'own',
    successStatus: 200,
    blockedBy: DEC_B09,
  },
  {
    api: 'API-036',
    method: 'GET',
    path: '/memberships/{id}/weekly-reports',
    matrixRow:
      '`GET /memberships/{id}/weekly-reports` | ✓ all | ✓ (g) | 🚫 | — | —',
    cells: STAFF_MEMBERSHIP_ASSISTANT_BLOCKED,
    scope: 'resource',
    successStatus: 200,
    blockedBy: DEC_B09,
  },

  // ── §6.1 rows 20–22: performance (Assistant 🚫 DEC-B09) ─────────────────
  {
    api: 'API-037',
    method: 'GET',
    path: '/me/performance',
    matrixRow: '`GET /me/performance` | — | — | 🚫 | ✓ own | —',
    cells: STUDENT_OWN_ASSISTANT_BLOCKED,
    scope: 'own',
    successStatus: 200,
    blockedBy: DEC_B09,
  },
  {
    api: 'API-038',
    method: 'GET',
    path: '/groups/{id}/performance',
    matrixRow:
      '`GET /groups/{id}/performance`, `/at-risk` | ✓ all | ✓ (g) | 🚫 | — | —',
    cells: STAFF_MEMBERSHIP_ASSISTANT_BLOCKED,
    scope: 'resource',
    successStatus: 200,
    blockedBy: DEC_B09,
  },
  {
    api: 'API-040',
    method: 'GET',
    path: '/groups/{id}/at-risk',
    matrixRow:
      '`GET /groups/{id}/performance`, `/at-risk` | ✓ all | ✓ (g) | 🚫 | — | —',
    cells: STAFF_MEMBERSHIP_ASSISTANT_BLOCKED,
    scope: 'resource',
    successStatus: 200,
    blockedBy: DEC_B09,
  },
  {
    api: 'API-039',
    method: 'GET',
    path: '/memberships/{id}/performance',
    matrixRow:
      '`GET /memberships/{id}/performance` | ✓ all | ✓ (g) | 🚫 | ✓ own | —',
    cells: {
      Admin: '✓ all',
      Teacher: '✓ (g)',
      Assistant: '🚫',
      Student: '✓ own',
      User: '—',
    },
    scope: 'resource',
    successStatus: 200,
    blockedBy: DEC_B09,
  },

  // ── §6.1 rows 23–24: progress (Assistant 🚫 DEC-B09) ────────────────────
  {
    api: 'API-041',
    method: 'GET',
    path: '/me/progress',
    matrixRow: '`GET /me/progress` | — | — | 🚫 | ✓ own | —',
    cells: STUDENT_OWN_ASSISTANT_BLOCKED,
    scope: 'own',
    successStatus: 200,
    blockedBy: DEC_B09,
  },
  {
    api: 'API-042',
    method: 'GET',
    path: '/memberships/{id}/progress',
    matrixRow: '`GET /memberships/{id}/progress` | ✓ all | ✓ (g) | 🚫 | — | —',
    cells: STAFF_MEMBERSHIP_ASSISTANT_BLOCKED,
    scope: 'resource',
    successStatus: 200,
    blockedBy: DEC_B09,
  },

  // ── §6.1 row 25: Quran reference data ───────────────────────────────────
  {
    api: 'API-043',
    method: 'GET',
    path: '/quran/surahs',
    matrixRow: '`GET /quran/surahs`, `/hizb-boundaries` | ✓ | ✓ | ✓ | ✓ | ✓',
    cells: ALL_FIVE,
    scope: 'none',
    successStatus: 200,
  },
  {
    api: 'API-044',
    method: 'GET',
    path: '/quran/hizb-boundaries',
    matrixRow: '`GET /quran/surahs`, `/hizb-boundaries` | ✓ | ✓ | ✓ | ✓ | ✓',
    cells: ALL_FIVE,
    scope: 'none',
    successStatus: 200,
  },

  // ── §6.1 rows 26–28: payments (Teacher 🚫 SRS §10) ──────────────────────
  {
    api: 'API-045',
    method: 'GET',
    path: '/me/payments',
    matrixRow: '`GET /me/payments` | — | — | — | ✓ own | —',
    cells: {
      Admin: '—',
      Teacher: '—',
      Assistant: '—',
      Student: '✓ own',
      User: '—',
    },
    scope: 'own',
    successStatus: 200,
  },
  {
    api: 'API-046',
    method: 'GET',
    path: '/groups/{id}/payments',
    matrixRow:
      '`GET /groups/{id}/payments` | ✓ all | 🚫 (SRS §10) | ✓ (g) | — | —',
    cells: {
      Admin: '✓ all',
      Teacher: '🚫',
      Assistant: '✓ (g)',
      Student: '—',
      User: '—',
    },
    scope: 'resource',
    successStatus: 200,
    blockedBy: SRS_10_TEACHER_PAYMENTS,
  },
  {
    api: 'API-047',
    method: 'POST',
    path: '/memberships/{id}/payments',
    matrixRow: '`POST /memberships/{id}/payments` | — | — | ✓ (g) | — | —',
    cells: {
      Admin: '—',
      Teacher: '—',
      Assistant: '✓ (g)',
      Student: '—',
      User: '—',
    },
    scope: 'resource',
    successStatus: 201,
  },

  // ── §6.1 row 29: notifications — every role, own ────────────────────────
  {
    api: 'API-048',
    method: 'POST',
    path: '/devices',
    matrixRow: NOTIFICATIONS_ROW,
    cells: NOTIFICATIONS_CELLS,
    scope: 'own',
    successStatus: 200,
  },
  {
    api: 'API-049',
    method: 'DELETE',
    path: '/devices/{id}',
    matrixRow: NOTIFICATIONS_ROW,
    cells: NOTIFICATIONS_CELLS,
    scope: 'resource',
    successStatus: 204,
  },
  {
    api: 'API-050',
    method: 'GET',
    path: '/me/notification-preferences',
    matrixRow: NOTIFICATIONS_ROW,
    cells: NOTIFICATIONS_CELLS,
    scope: 'own',
    successStatus: 200,
  },
  {
    api: 'API-051',
    method: 'PATCH',
    path: '/me/notification-preferences',
    matrixRow: NOTIFICATIONS_ROW,
    cells: NOTIFICATIONS_CELLS,
    scope: 'own',
    successStatus: 200,
  },

  // ── §6.1 row 30: administration — Admin ─────────────────────────────────
  {
    api: 'API-052',
    method: 'PATCH',
    path: '/users/{id}/role',
    matrixRow: ADMINISTRATION_ROW,
    cells: ADMIN_ONLY,
    scope: 'none',
    successStatus: 200,
  },
  {
    api: 'API-053',
    method: 'GET',
    path: '/users',
    matrixRow: ADMINISTRATION_ROW,
    cells: ADMIN_ONLY,
    scope: 'none',
    successStatus: 200,
  },
  {
    api: 'API-054',
    method: 'GET',
    path: '/audit',
    matrixRow: ADMINISTRATION_ROW,
    cells: ADMIN_ONLY,
    scope: 'none',
    successStatus: 200,
  },
];

/**
 * The APIS §6.1 cells that block the Assistant (DEC-B09) and the Teacher
 * (SRS §10). Listed separately, by role, so that a swap of the two
 * exclusions fails loudly instead of cancelling itself out inside the table
 * above: the Assistant must be blocked on Reports/Weekly/Performance/
 * Progress and *not* on Payments; the Teacher must be blocked on Payments
 * and *not* on Reports/Weekly/Performance/Progress.
 */
export const INVERTED_EXCLUSIONS = {
  /** DEC-B09 — Assistant, and only the Assistant, is 🚫 here. */
  assistantBlocked: [
    'API-029',
    'API-030',
    'API-031',
    'API-032',
    'API-033',
    'API-034',
    'API-035',
    'API-036',
    'API-037',
    'API-038',
    'API-039',
    'API-040',
    'API-041',
    'API-042',
  ] as const,
  /** SRS §10 — Teacher, and only the Teacher, is 🚫 here. */
  teacherBlocked: ['API-046'] as const,
  /**
   * Where the *other* role of the inverted pair keeps access. If DEC-B09 and
   * SRS §10 were ever swapped, these are the cells that would break first.
   */
  teacherKeepsAccess: [
    'API-032',
    'API-036',
    'API-038',
    'API-039',
    'API-040',
    'API-042',
  ] as const,
  assistantKeepsAccess: ['API-046', 'API-047'] as const,
} as const;

export function endpointOf(api: string): EndpointAuthz {
  const found = AUTHORIZATION_MATRIX.find((e) => e.api === api);
  if (!found) {
    throw new Error(`No matrix entry for ${api}`);
  }
  return found;
}
