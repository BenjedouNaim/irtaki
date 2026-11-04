import * as api from './api.js';
import type { Gender, GroupItem, JoinRequestInput, Session } from './api.js';
import { backdateMembership } from './db.js';
import { env } from '../support/env.js';
import { notToday } from '../support/time.js';

/**
 * Scenario builders: each returns a ready-to-use slice of the world, created
 * through the API. Names and emails carry the run id so specs are
 * parallel-safe and re-runnable against the same database.
 */

let counter = 0;
export function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${env.runId}-${counter}`;
}

export function uniqueEmail(prefix = 'user'): string {
  return `e2e.${unique(prefix)}@irtaki.tn`.toLowerCase();
}

export const E2E_PASSWORD = 'E2e-pass-2026';

// ── Seeded staff (backend/seed/run-seed.ts) ────────────────────────────────

export const SEEDED = {
  admin: 'admin@irtaki.tn',
  teacherMale: 'teacher1@irtaki.tn',
  teacherFemale: 'teacher2@irtaki.tn',
  assistantMale: 'assistant1@irtaki.tn',
  assistantFemale: 'assistant2@irtaki.tn',
} as const;

export interface Staff {
  admin: Session;
  teacherMale: Session;
  teacherFemale: Session;
  assistantMale: Session;
  assistantFemale: Session;
}

let staffCache: Promise<Staff> | undefined;

export function staff(): Promise<Staff> {
  staffCache ??= (async () => {
    const [admin, teacherMale, teacherFemale, assistantMale, assistantFemale] = await Promise.all(
      Object.values(SEEDED).map((email) => api.login(email, env.seedPassword)),
    );
    return { admin, teacherMale, teacherFemale, assistantMale, assistantFemale };
  })();
  return staffCache;
}

// ── Groups ──────────────────────────────────────────────────────────────────

export interface GroupFixture extends GroupItem {
  teacher: Session;
  assistant: Session;
}

/**
 * A fresh User promoted to Teacher or Assistant (UC-17). Each group gets its own
 * staff by default, so an Assistant's queue/ledger or a Teacher's Home only
 * holds what the current test created — no leftovers from earlier tests.
 */
export async function staffMember(role: 'Teacher' | 'Assistant'): Promise<Session> {
  const s = await staff();
  const u = await user(role.toLowerCase());
  await api.promote(s.admin.token, u.id, role);
  return api.login(u.email, u.password);
}

/**
 * An Active group. `open` (default true) opens enrollment; groups are created
 * Closed (UC-10). `recitationDay` defaults to a day that is not today, so daily
 * reports are allowed. Pass `teacher`/`assistant` to share staff between groups.
 */
export async function group(
  opts: {
    gender?: Gender;
    recitationDay?: number;
    open?: boolean;
    name?: string;
    teacher?: Session;
    assistant?: Session;
  } = {},
): Promise<GroupFixture> {
  const s = await staff();
  const gender = opts.gender ?? 'Female';
  const [teacher, assistant] = await Promise.all([
    opts.teacher ?? staffMember('Teacher'),
    opts.assistant ?? staffMember('Assistant'),
  ]);
  const created = await api.createGroup(s.admin.token, {
    name: opts.name ?? unique('E2E حلقة'),
    gender,
    recitationDay: opts.recitationDay ?? notToday(),
    teacherId: teacher.id,
    assistantId: assistant.id,
  });
  if (opts.open ?? true) {
    await api.setEnrollment(teacher.token, created.id, 'Open');
    created.enrollment_status = 'Open';
  }
  return { ...created, teacher, assistant };
}

// ── People ──────────────────────────────────────────────────────────────────

export async function user(prefix = 'user'): Promise<Session> {
  return api.register(uniqueEmail(prefix), E2E_PASSWORD);
}

export interface ApplicantFixture {
  session: Session;
  fullName: string;
  joinRequestId: string;
  score: number;
}

export async function applicant(
  g: GroupFixture,
  overrides: Partial<Omit<JoinRequestInput, 'groupId' | 'gender'>> = {},
): Promise<ApplicantFixture> {
  const session = await user('applicant');
  const fullName = overrides.fullName ?? unique('طالب');
  const jr = await api.submitJoinRequest(session.token, {
    groupId: g.id,
    gender: g.gender as Gender,
    fullName,
    ...overrides,
  });
  return { session, fullName, joinRequestId: jr.id, score: jr.score };
}

export interface StudentFixture {
  /** A fresh Student session (re-logged in after acceptance so the token carries the role). */
  session: Session;
  fullName: string;
  membershipId: string;
  group: GroupFixture;
}

/** An accepted student. `startedAt` backdates the membership (payment cycles, expected days). */
export async function student(
  g: GroupFixture,
  opts: { startedAt?: string; overrides?: Partial<Omit<JoinRequestInput, 'groupId' | 'gender'>> } = {},
): Promise<StudentFixture> {
  const a = await applicant(g, opts.overrides);
  const { membershipId } = await api.acceptJoinRequest(g.assistant.token, a.joinRequestId);
  if (opts.startedAt) await backdateMembership(membershipId, opts.startedAt);
  const session = await api.login(a.session.email, a.session.password);
  return { session, fullName: a.fullName, membershipId, group: g };
}
