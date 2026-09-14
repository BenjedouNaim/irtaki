import { env } from '../support/env.js';

/**
 * Thin typed client over the public REST API (docs/APIS.md). Fixtures create
 * state through the same endpoints the app uses, so domain rules and database
 * triggers stay in force; SQL is reserved for shifting time (see db.ts).
 */

export type Role = 'Admin' | 'Teacher' | 'Assistant' | 'Student' | 'User';
export type Gender = 'Male' | 'Female';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly method: string,
    readonly url: string,
  ) {
    super(`${method} ${url} → ${status}: ${JSON.stringify(body)}`);
  }

  get code(): string | undefined {
    const b = this.body as { error?: unknown } | null;
    return typeof b?.error === 'string' ? b.error : undefined;
  }
}

async function request<T>(
  method: string,
  pathname: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<T> {
  const url = `${env.apiUrl}${pathname}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, parsed, method, url);
  return parsed as T;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  role: Role;
  email: string;
  password: string;
  token: string;
}

interface LoginResponse {
  id: string;
  role: Role;
  access_token: string;
}

export async function login(email: string, password: string): Promise<Session> {
  const r = await request<LoginResponse>('POST', '/auth/login', {
    body: { email, password },
  });
  return { id: r.id, role: r.role, email, password, token: r.access_token };
}

export async function register(
  email: string,
  password: string,
  timezone = env.timezone,
): Promise<Session> {
  const r = await request<LoginResponse>('POST', '/auth/register', {
    body: { email, password, timezone },
  });
  return { id: r.id, role: r.role, email, password, token: r.access_token };
}

export async function requestPasswordReset(email: string): Promise<void> {
  await request('POST', '/auth/password-reset/request', { body: { email } });
}

// ── Users ───────────────────────────────────────────────────────────────────

export interface UserListItem {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
}

export async function listUsers(adminToken: string, role?: Role): Promise<UserListItem[]> {
  const out: UserListItem[] = [];
  let cursor: string | null = null;
  do {
    const qs = new URLSearchParams({ limit: '100' });
    if (role) qs.set('role', role);
    if (cursor) qs.set('cursor', cursor);
    const page: {
      data: UserListItem[];
      pagination: { next_cursor: string | null; has_more: boolean };
    } = await request('GET', `/users?${qs.toString()}`, { token: adminToken });
    out.push(...page.data);
    cursor = page.pagination.has_more ? page.pagination.next_cursor : null;
  } while (cursor);
  return out;
}

export async function promote(
  adminToken: string,
  userId: string,
  role: 'Teacher' | 'Assistant',
): Promise<void> {
  await request('PATCH', `/users/${userId}/role`, { token: adminToken, body: { role } });
}

// ── Groups ──────────────────────────────────────────────────────────────────

export interface GroupItem {
  id: string;
  name: string;
  gender: Gender;
  recitation_day: number;
  enrollment_status: 'Open' | 'Closed';
  lifecycle_state: 'Active' | 'Archived';
}

export async function createGroup(
  adminToken: string,
  input: {
    name: string;
    gender: Gender;
    recitationDay: number;
    teacherId: string;
    assistantId: string;
  },
): Promise<GroupItem> {
  const r = await request<{ data: GroupItem }>('POST', '/groups', {
    token: adminToken,
    body: {
      name: input.name,
      gender: input.gender,
      recitation_day: input.recitationDay,
      teacher_id: input.teacherId,
      assistant_id: input.assistantId,
    },
  });
  return r.data;
}

export async function setEnrollment(
  teacherToken: string,
  groupId: string,
  status: 'Open' | 'Closed',
): Promise<void> {
  await request('PATCH', `/groups/${groupId}/enrollment`, {
    token: teacherToken,
    body: { enrollment_status: status },
  });
}

export async function setLifecycle(
  adminToken: string,
  groupId: string,
  state: 'Active' | 'Archived',
): Promise<void> {
  await request('PATCH', `/groups/${groupId}/lifecycle`, {
    token: adminToken,
    body: { lifecycle_state: state },
  });
}

export async function reassignStaff(
  adminToken: string,
  groupId: string,
  staff: { teacherId?: string; assistantId?: string },
): Promise<void> {
  await request('PATCH', `/groups/${groupId}/staff`, {
    token: adminToken,
    body: { teacher_id: staff.teacherId, assistant_id: staff.assistantId },
  });
}

export async function deleteGroup(adminToken: string, groupId: string): Promise<void> {
  await request('DELETE', `/groups/${groupId}`, { token: adminToken });
}

// ── Enrollment ──────────────────────────────────────────────────────────────

export type TajweedLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export interface JoinRequestInput {
  groupId: string;
  fullName: string;
  gender: Gender;
  age?: number;
  phone?: string;
  occupation?: string;
  city?: string;
  ahzab?: number[];
  tajweedLevel?: TajweedLevel;
  studiedTajweedTheory?: boolean;
  studiedQalun?: boolean;
}

export async function submitJoinRequest(
  userToken: string,
  input: JoinRequestInput,
): Promise<{ id: string; score: number }> {
  const r = await request<{ data: { id: string; score: number } }>(
    'POST',
    '/join-requests',
    {
      token: userToken,
      body: {
        group_id: input.groupId,
        full_name: input.fullName,
        gender: input.gender,
        age: input.age ?? 24,
        phone_number: input.phone ?? '22123456',
        occupation: input.occupation ?? 'مهندس',
        city: input.city ?? 'المنستير',
        memorized_ahzab: input.ahzab ?? [1, 2, 3, 4, 5],
        tajweed_level: input.tajweedLevel ?? 'Intermediate',
        studied_tajweed_theory: input.studiedTajweedTheory ?? true,
        studied_qalun: input.studiedQalun ?? true,
        fee_agreement: true,
        program_goal: 'Memorization',
      },
    },
  );
  return r.data;
}

export async function acceptJoinRequest(
  assistantToken: string,
  joinRequestId: string,
): Promise<{ membershipId: string }> {
  const r = await request<{ data: { membership_id: string } }>(
    'POST',
    `/join-requests/${joinRequestId}/accept`,
    { token: assistantToken },
  );
  return { membershipId: r.data.membership_id };
}

export async function rejectJoinRequest(
  assistantToken: string,
  joinRequestId: string,
): Promise<void> {
  await request('POST', `/join-requests/${joinRequestId}/reject`, {
    token: assistantToken,
  });
}

export async function terminateMembership(
  adminToken: string,
  membershipId: string,
): Promise<void> {
  await request('DELETE', `/memberships/${membershipId}`, { token: adminToken });
}

// ── Reports ─────────────────────────────────────────────────────────────────

export interface AyahPosition {
  surah: number;
  ayah: number;
}

export interface DailyReportInput {
  type: 'Normal' | 'Absent' | 'Revision';
  absence_reason?: 'Sick' | 'Studying' | 'Other';
  memo_range?: { from: AyahPosition; to: AyahPosition };
  memo_time?: { from: string; to: string };
  completed_50_repetitions?: boolean;
  repetitions_in_single_session?: boolean;
  rev_range?: { from: AyahPosition; to: AyahPosition };
  rev_time?: { from: string; to: string };
  read_tafsir?: boolean;
}

export async function submitDailyReport(
  studentToken: string,
  input: DailyReportInput,
): Promise<{ id: string }> {
  const r = await request<{ data: { id: string } }>('POST', '/daily-reports', {
    token: studentToken,
    body: input,
  });
  return r.data;
}

export interface WeeklyLive {
  id: string | null;
  week_start: string;
  week_end: string;
  expected_days: number;
  missed_daily_reports: number;
  missed_daily_memorization: number;
  missed_daily_revision: number;
  missed_50_repetitions: number;
  missed_single_session: number;
  attended_recitation_call: boolean;
  state: string;
  can_confirm: boolean;
}

export async function currentWeeklyReport(studentToken: string): Promise<WeeklyLive> {
  const r = await request<{ data: WeeklyLive }>('GET', '/weekly-reports/current', {
    token: studentToken,
  });
  return r.data;
}

export async function confirmWeeklyReport(
  studentToken: string,
  weeklyReportId: string,
  attended: boolean,
): Promise<void> {
  await request('POST', `/weekly-reports/${weeklyReportId}/confirm`, {
    token: studentToken,
    body: { attended_recitation_call: attended },
  });
}

// ── Payments ────────────────────────────────────────────────────────────────

export interface PaymentCycle {
  index: number;
  start_date: string;
  end_date: string;
  status: string;
  paid_at?: string;
}

export interface Ledger {
  cycles: PaymentCycle[];
  next_due_date: string | null;
  arrears_count: number;
}

export async function recordPayment(
  assistantToken: string,
  membershipId: string,
  cycleIndex: number,
): Promise<void> {
  await request('POST', `/memberships/${membershipId}/payments`, {
    token: assistantToken,
    body: { cycle_index: cycleIndex },
  });
}

export async function ownLedger(studentToken: string): Promise<Ledger> {
  const r = await request<{ data: Ledger }>('GET', '/me/payments', { token: studentToken });
  return r.data;
}
