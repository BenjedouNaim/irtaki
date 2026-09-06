/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module';
import {
  IMailer,
  MAILER,
} from '../../src/modules/identity/domain/mailer.interface';
import {
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { JoinRequestAcceptedEvent } from '../../src/modules/enrollment/domain/events/join-request-accepted.event';
import { JoinRequestRejectedEvent } from '../../src/modules/enrollment/domain/events/join-request-rejected.event';
import { JoinRequestSubmittedEvent } from '../../src/modules/enrollment/domain/events/join-request-submitted.event';
import { GroupArchivedEvent } from '../../src/modules/groups/domain/events/group-archived.event';
import { MembershipTerminatedEvent } from '../../src/modules/memberships/domain/events/membership-terminated.event';
import { AtRiskEvaluator } from '../../src/modules/notifications/application/evaluators/at-risk.evaluator';
import { DailyReminderEvaluator } from '../../src/modules/notifications/application/evaluators/daily-reminder.evaluator';
import { PaymentDueSoonEvaluator } from '../../src/modules/notifications/application/evaluators/payment-due-soon.evaluator';
import { WeeklyReportAvailableEvaluator } from '../../src/modules/notifications/application/evaluators/weekly-report-available.evaluator';
import { NotificationService } from '../../src/modules/notifications/application/dispatch/notification.service';
import { EnrollmentNotificationListener } from '../../src/modules/notifications/application/listeners/enrollment-notification.listener';
import { GroupNotificationListener } from '../../src/modules/notifications/application/listeners/group-notification.listener';
import { MembershipNotificationListener } from '../../src/modules/notifications/application/listeners/membership-notification.listener';
import { NOTIFICATION_EVENT_TYPES } from '../../src/modules/notifications/domain/notification-event';
import type { PushPayload } from '../../src/modules/notifications/domain/push-payload';
import {
  PUSH_SENDER,
  type IPushSender,
  type PushSendResult,
} from '../../src/modules/notifications/domain/push-sender.interface';
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

/** One tick of ADR-030's cron, in minutes. */
const TICK = 15;

/** Friday — the fixture groups' recitation day unless a case needs another. */
const FRIDAY = 5;
/** Monday — the day every fixture instant below falls on, student-local. */
const MONDAY = 1;

const TUNIS = 'Africa/Tunis'; // UTC+1, no DST
const AUCKLAND = 'Pacific/Auckland'; // UTC+12 in September

/** Monday 2026-09-07, 20:00 in Tunis. */
const TUNIS_2000 = new Date('2026-09-07T19:00:00.000Z');
/** The same Monday, 20:00 in Auckland — eleven hours earlier in UTC. */
const AUCKLAND_2000 = new Date('2026-09-07T08:00:00.000Z');
/** Local midnight entering Friday 2026-09-11, in each timezone. */
const TUNIS_FRIDAY_MIDNIGHT = new Date('2026-09-10T23:00:00.000Z');
const AUCKLAND_FRIDAY_MIDNIGHT = new Date('2026-09-10T12:00:00.000Z');

const STARTED_AT = '2026-06-01';

interface Student {
  userId: string;
  membershipId: string;
  groupId: string;
  deviceTokenId: string;
}

interface LogRow {
  category: string;
  outcome: string;
  transport_reference: string | null;
}

/** The same row seen through ISS #135's `subject_id` (what it was ABOUT). */
interface SubjectLogRow {
  category: string;
  outcome: string;
  subject_id: string | null;
}

/**
 * F-NOT-05 end to end against real Postgres: every one of SAS §22.2's eight
 * events driven through the ONE `NotificationService` path (ADR-009,
 * SA §21), with the EXT-03 transport replaced by a recorder so the payload
 * that would have crossed the third party can be inspected field by field
 * (BR-46).
 *
 * The transport is the only thing stubbed. Preferences, the DBT-15
 * catalogue with its `is_mutable` flags, DB-CHK-09's trigger, the §22.3
 * suppression reads and every `notification_log` row are the real ones.
 */
describe('F-NOT-05 — notification dispatch (SAS §22, SA §21) Integration', () => {
  jest.setTimeout(120000);

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let enrollmentListener: EnrollmentNotificationListener;
  let groupListener: GroupNotificationListener;
  let membershipListener: MembershipNotificationListener;
  let dailyReminder: DailyReminderEvaluator;
  let weeklyAvailable: WeeklyReportAvailableEvaluator;
  let atRisk: AtRiskEvaluator;
  let paymentDueSoon: PaymentDueSoonEvaluator;
  let notifications: NotificationService;

  const testEmailDomain = '@test-notification-dispatch.com';
  const testGroupPrefix = 'F-NOT-05 dispatch group';

  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  /** Everything the recorder saw, in order. */
  const pushed: Array<{ token: string; payload: PushPayload }> = [];
  let nextSendResult: PushSendResult = {
    status: 'sent',
    transportReference: 'expo-ticket',
  };
  let sendThrows = false;

  const recordingSender: IPushSender = {
    send: (token: string, payload: PushPayload): Promise<PushSendResult> => {
      pushed.push({ token, payload });
      if (sendThrows) {
        return Promise.reject(new Error('FCM unreachable'));
      }
      return Promise.resolve(nextSendResult);
    },
  };

  let sharedTeacherId: string;
  let sharedAssistantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER)
      .useValue(mockMailer)
      .overrideProvider(PUSH_SENDER)
      .useValue(recordingSender)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    // ADR-024's crons are live inside a booted AppModule; every suite
    // drives the jobs it cares about with its own clock instead.
    stopScheduledJobs(app);

    dataSource = app.get(DataSource);
    enrollmentListener = app.get(EnrollmentNotificationListener);
    groupListener = app.get(GroupNotificationListener);
    membershipListener = app.get(MembershipNotificationListener);
    dailyReminder = app.get(DailyReminderEvaluator);
    weeklyAvailable = app.get(WeeklyReportAvailableEvaluator);
    atRisk = app.get(AtRiskEvaluator);
    paymentDueSoon = app.get(PaymentDueSoonEvaluator);
    notifications = app.get(NotificationService);

    await cleanDatabase();
    sharedTeacherId = await createUser('Teacher', TUNIS);
    sharedAssistantId = await createUser('Assistant', TUNIS);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  });

  beforeEach(() => {
    pushed.length = 0;
    sendThrows = false;
    nextSendResult = { status: 'sent', transportReference: 'expo-ticket' };
  });

  async function cleanDatabase(): Promise<void> {
    await purgeNotificationLog(dataSource);
    const mine = `(SELECT id FROM users WHERE email LIKE $1)`;
    const params = [`%${testEmailDomain}`];
    for (const statement of [
      `DELETE FROM notification_log WHERE user_id IN ${mine}`,
      `DELETE FROM notification_preferences WHERE user_id IN ${mine}`,
      `DELETE FROM device_tokens WHERE user_id IN ${mine}`,
      `DELETE FROM payment_records WHERE membership_id IN (SELECT id FROM memberships WHERE user_id IN ${mine})`,
      `DELETE FROM daily_reports WHERE membership_id IN (SELECT id FROM memberships WHERE user_id IN ${mine})`,
      `DELETE FROM weekly_reports WHERE membership_id IN (SELECT id FROM memberships WHERE user_id IN ${mine})`,
      `DELETE FROM coverage_intervals WHERE coverage_id IN (SELECT id FROM memorization_coverage WHERE membership_id IN (SELECT id FROM memberships WHERE user_id IN ${mine}))`,
      `DELETE FROM memorization_coverage WHERE membership_id IN (SELECT id FROM memberships WHERE user_id IN ${mine})`,
      `DELETE FROM memberships WHERE user_id IN ${mine}`,
      `DELETE FROM join_requests WHERE user_id IN ${mine}`,
      `DELETE FROM groups WHERE name LIKE '${testGroupPrefix}%' AND $1::text IS NOT NULL`,
      `DELETE FROM audit_entries WHERE actor_id IN ${mine}`,
      `DELETE FROM auth_tokens WHERE user_id IN ${mine}`,
      `DELETE FROM users WHERE email LIKE $1`,
    ]) {
      await dataSource.query(statement, params);
    }
  }

  async function createUser(role: string, timezone: string): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, gender, timezone)
       VALUES ($1, $2, 'not-a-login-in-this-suite', $3, $4, 'Male', $5)`,
      [
        id,
        `${role.toLowerCase()}-${id}${testEmailDomain}`,
        role,
        `فلان الفلاني ${id.slice(0, 6)}`,
        timezone,
      ],
    );
    return id;
  }

  async function createGroup(
    options: { recitationDay?: number; archivedAt?: string | null } = {},
  ): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by, archived_at
       ) VALUES ($1, $2, 'Male', $3, 'Closed', $4, $5, $6, $5, $7)`,
      [
        id,
        `${testGroupPrefix} ${uuidv7()}`,
        options.recitationDay ?? FRIDAY,
        options.archivedAt ? 'Archived' : 'Active',
        sharedTeacherId,
        sharedAssistantId,
        options.archivedAt ?? null,
      ],
    );
    return id;
  }

  async function registerDevice(userId: string): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO device_tokens (id, user_id, token, platform)
       VALUES ($1, $2, $3, 'iOS')`,
      [id, userId, `ExponentPushToken[${id}]`],
    );
    return id;
  }

  /** A Student with a live membership, a live group and a live push token. */
  async function createStudent(
    options: {
      timezone?: string;
      recitationDay?: number;
      archivedAt?: string | null;
      terminated?: boolean;
      startedAt?: string;
      withDevice?: boolean;
      groupId?: string;
    } = {},
  ): Promise<Student> {
    const userId = await createUser('Student', options.timezone ?? TUNIS);
    const groupId =
      options.groupId ??
      (await createGroup({
        recitationDay: options.recitationDay,
        archivedAt: options.archivedAt,
      }));
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (id, user_id, group_id, state, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5::date, $6::date)`,
      [
        membershipId,
        userId,
        groupId,
        options.terminated ? 'Terminated' : 'Active',
        options.startedAt ?? STARTED_AT,
        options.terminated ? '2026-09-01' : null,
      ],
    );
    const deviceTokenId =
      options.withDevice === false ? '' : await registerDevice(userId);
    return { userId, membershipId, groupId, deviceTokenId };
  }

  /**
   * The seeded Admin, with a known password, for the cases that drive a real
   * endpoint rather than a listener directly.
   */
  async function loginAsAdmin(): Promise<string> {
    const password = 'Password123!';
    const admins: Array<{ id: string; email: string }> = await dataSource.query(
      "SELECT id, email FROM users WHERE role = 'Admin' LIMIT 1",
    );
    const hasher = app.get<IPasswordHasher>(PASSWORD_HASHER);
    await dataSource.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [await hasher.hash(password), admins[0].id],
    );
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admins[0].email, password });
    return login.body.access_token as string;
  }

  async function mute(userId: string, category: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO notification_preferences (id, user_id, category, muted)
       VALUES ($1, $2, $3, true)`,
      [uuidv7(), userId, category],
    );
  }

  async function submitReport(
    membershipId: string,
    reportDate: string,
    timezone = TUNIS,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO daily_reports (
         id, membership_id, report_date, type, submitted_timezone,
         no_memorization_today, no_revision_today
       ) VALUES ($1, $2, $3::date, 'Normal', $4, true, true)`,
      [uuidv7(), membershipId, reportDate, timezone],
    );
  }

  /**
   * The pushes addressed at one resource. Every evaluator sweep in this
   * suite is GLOBAL — that is what a scheduled job does — so an assertion
   * about "nothing was sent" has to be about THIS fixture, never about the
   * recorder as a whole.
   */
  function pushedFor(resourceId: string): PushPayload[] {
    return pushed
      .map((entry) => entry.payload)
      .filter((payload) => payload.resourceId === resourceId);
  }

  /**
   * A listener's row lands after the response it followed (ADR-032), so a
   * suite that triggers one waits for it rather than sleeping — otherwise
   * the write is still in flight when the suite tears its fixtures down.
   */
  async function eventuallyLogged(userId: string): Promise<LogRow[]> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const rows = await logFor(userId);
      if (rows.length > 0) {
        return rows;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return logFor(userId);
  }

  async function logFor(userId: string): Promise<LogRow[]> {
    return dataSource.query<LogRow[]>(
      `SELECT category, outcome, transport_reference
         FROM notification_log
        WHERE user_id = $1
        ORDER BY dispatched_at, category`,
      [userId],
    );
  }

  /**
   * ISS #135's column, read back. `logFor` above deliberately does not
   * select it — every assertion written before this issue compares the whole
   * row — so the subject is asserted separately where it is the point.
   */
  async function subjectLogFor(userId: string): Promise<SubjectLogRow[]> {
    return dataSource.query<SubjectLogRow[]>(
      `SELECT category, outcome, subject_id
         FROM notification_log
        WHERE user_id = $1
        ORDER BY dispatched_at, subject_id`,
      [userId],
    );
  }

  /** Just the subjects this user was notified about, in dispatch order. */
  async function subjectsFor(userId: string): Promise<Array<string | null>> {
    return (await subjectLogFor(userId)).map((row) => row.subject_id);
  }

  /**
   * A listener's rows land after the response it followed (ADR-032), and a
   * fan-out lands as several. Wait for the count the case expects rather
   * than for the first row, so an assertion cannot pass on a partial write.
   */
  async function eventuallyLoggedCount(
    userId: string,
    expected: number,
  ): Promise<SubjectLogRow[]> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const rows = await subjectLogFor(userId);
      if (rows.length >= expected) {
        return rows;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return subjectLogFor(userId);
  }

  // ────────────────────────────────────────────────────────────────────
  // BR-46 — the payload, on every event type, with no exceptions
  // ────────────────────────────────────────────────────────────────────

  describe('BR-46 / FR-NOTIF-07 — every payload is exactly two fields', () => {
    it('carries { eventType, resourceId } and nothing else on all 8 events', async () => {
      const student = await createStudent();
      const applicant = await createUser('User', TUNIS);
      await registerDevice(applicant);
      await registerDevice(sharedTeacherId);
      await registerDevice(sharedAssistantId);
      await submitReport(student.membershipId, '2026-09-02');

      // N-03, N-04, N-05, N-08 — the four event-driven ones. Every resource
      // id is a real UUIDv7: ISS #135 stores it in `notification_log.
      // subject_id`, which is a UUID column like `audit_entries.target_id`.
      const acceptedRequestId = uuidv7();
      const rejectedRequestId = uuidv7();
      const submittedRequestId = uuidv7();
      await enrollmentListener.onJoinRequestAccepted(
        new JoinRequestAcceptedEvent(
          acceptedRequestId,
          student.membershipId,
          applicant,
        ),
      );
      await enrollmentListener.onJoinRequestRejected(
        new JoinRequestRejectedEvent(rejectedRequestId, applicant),
      );
      await enrollmentListener.onJoinRequestSubmitted(
        new JoinRequestSubmittedEvent(
          submittedRequestId,
          student.groupId,
          applicant,
          88.5,
          new Date(),
        ),
      );
      await membershipListener.onMembershipTerminated(
        new MembershipTerminatedEvent(
          student.membershipId,
          sharedTeacherId,
          '2026-09-07',
        ),
      );

      // N-01, N-02, N-06, N-07 — the four scheduler-evaluated ones.
      const live = await createStudent({ recitationDay: FRIDAY });
      await dailyReminder.evaluate(TUNIS_2000, TICK);
      await weeklyAvailable.evaluate(TUNIS_FRIDAY_MIDNIGHT, TICK);
      await atRisk.evaluate(new Date('2026-09-07T00:00:00.000Z'));
      await paymentDueSoon.evaluate(new Date('2026-11-25T00:00:00.000Z'));
      expect(live.membershipId).toEqual(expect.any(String));

      const seen = new Set(pushed.map((p) => p.payload.eventType));
      for (const eventType of NOTIFICATION_EVENT_TYPES) {
        expect(seen).toContain(eventType);
      }

      for (const { payload } of pushed) {
        expect(Object.keys(payload).sort()).toEqual([
          'eventType',
          'resourceId',
        ]);
      }

      // Nothing NFR-10 restricts reaches EXT-03: no name, no phone, no
      // report content, no score, no metric, no payment amount.
      const serialised = JSON.stringify(pushed.map((entry) => entry.payload));
      expect(serialised).not.toContain('فلان');
      expect(serialised).not.toContain('88.5');
      expect(serialised).not.toContain('full_name');
      expect(serialised).not.toContain('amount');
      expect(serialised).not.toContain('score');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // The four event-driven notifications
  // ────────────────────────────────────────────────────────────────────

  describe('N-03 join request accepted → Applicant (account-critical)', () => {
    it('dispatches and logs Sent with the transport reference', async () => {
      const applicant = await createUser('User', TUNIS);
      await registerDevice(applicant);
      const membershipId = uuidv7();

      await enrollmentListener.onJoinRequestAccepted(
        new JoinRequestAcceptedEvent(uuidv7(), membershipId, applicant),
      );

      expect(await logFor(applicant)).toEqual([
        {
          category: 'N-03',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
      expect(pushedFor(membershipId)).toEqual([
        { eventType: 'N-03', resourceId: membershipId },
      ]);
      // ISS #135: the row records the membership it was about, not only the
      // applicant it went to.
      expect(await subjectsFor(applicant)).toEqual([membershipId]);
    });

    it('cannot be muted at all — DB-CHK-09 rejects the preference row (BR-61)', async () => {
      const applicant = await createUser('User', TUNIS);

      await expect(mute(applicant, 'N-03')).rejects.toThrow(
        /account-critical/i,
      );
    });

    it('bypasses the mute check even against a forced muted row', async () => {
      const applicant = await createUser('User', TUNIS);
      await registerDevice(applicant);
      // The trigger is the storage backstop; disable it for this row only
      // to prove the APPLICATION never consults it for is_mutable = false.
      await dataSource.query(
        `ALTER TABLE notification_preferences DISABLE TRIGGER trg_notification_preferences_mutability`,
      );
      try {
        await mute(applicant, 'N-03');
      } finally {
        await dataSource.query(
          `ALTER TABLE notification_preferences ENABLE TRIGGER trg_notification_preferences_mutability`,
        );
      }

      await enrollmentListener.onJoinRequestAccepted(
        new JoinRequestAcceptedEvent(uuidv7(), uuidv7(), applicant),
      );

      expect(await logFor(applicant)).toEqual([
        {
          category: 'N-03',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
    });
  });

  describe('N-04 join request rejected → Applicant (account-critical)', () => {
    it('dispatches, addressed at the JoinRequest', async () => {
      const applicant = await createUser('User', TUNIS);
      await registerDevice(applicant);
      const joinRequestId = uuidv7();

      await enrollmentListener.onJoinRequestRejected(
        new JoinRequestRejectedEvent(joinRequestId, applicant),
      );

      expect(await logFor(applicant)).toEqual([
        {
          category: 'N-04',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
      expect(pushedFor(joinRequestId)).toEqual([
        { eventType: 'N-04', resourceId: joinRequestId },
      ]);
      expect(await subjectsFor(applicant)).toEqual([joinRequestId]);
    });
  });

  describe('N-05 new join request → Assistant of the target group (mutable)', () => {
    it('resolves the group assistant and dispatches to them', async () => {
      const assistant = await createUser('Assistant', TUNIS);
      await registerDevice(assistant);
      const groupId = uuidv7();
      await dataSource.query(
        `INSERT INTO groups (
           id, name, gender, recitation_day, enrollment_status,
           lifecycle_state, teacher_id, assistant_id, created_by
         ) VALUES ($1, $2, 'Male', $3, 'Open', 'Active', $4, $5, $4)`,
        [
          groupId,
          `${testGroupPrefix} ${uuidv7()}`,
          FRIDAY,
          sharedTeacherId,
          assistant,
        ],
      );

      const joinRequestId = uuidv7();
      await enrollmentListener.onJoinRequestSubmitted(
        new JoinRequestSubmittedEvent(
          joinRequestId,
          groupId,
          'applicant-x',
          91.25,
          new Date(),
        ),
      );

      expect(await logFor(assistant)).toEqual([
        {
          category: 'N-05',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
      // ISS #135's per-subject row is what a future N-05 cadence guard would
      // have to read: one Assistant serves many applicants (see the eight-row
      // table on `NotificationLogEntry.subjectId`).
      expect(await subjectsFor(assistant)).toEqual([joinRequestId]);
    });

    it('is suppressed when the Assistant has muted the category (FR-NOTIF-05)', async () => {
      const assistant = await createUser('Assistant', TUNIS);
      await registerDevice(assistant);
      await mute(assistant, 'N-05');
      const groupId = uuidv7();
      await dataSource.query(
        `INSERT INTO groups (
           id, name, gender, recitation_day, enrollment_status,
           lifecycle_state, teacher_id, assistant_id, created_by
         ) VALUES ($1, $2, 'Male', $3, 'Open', 'Active', $4, $5, $4)`,
        [
          groupId,
          `${testGroupPrefix} ${uuidv7()}`,
          FRIDAY,
          sharedTeacherId,
          assistant,
        ],
      );

      const joinRequestId = uuidv7();
      await enrollmentListener.onJoinRequestSubmitted(
        new JoinRequestSubmittedEvent(
          joinRequestId,
          groupId,
          'applicant-x',
          91.25,
          new Date(),
        ),
      );

      expect(await logFor(assistant)).toEqual([
        { category: 'N-05', outcome: 'Suppressed', transport_reference: null },
      ]);
      expect(pushedFor(joinRequestId)).toHaveLength(0);
      // A Suppressed row carries the subject too — SA §21 logs one row per
      // decision, and the decision was about THIS request.
      expect(await subjectsFor(assistant)).toEqual([joinRequestId]);
    });
  });

  describe('N-08 removed from group → Student (account-critical)', () => {
    it('resolves the removed Student from the membership and dispatches', async () => {
      const student = await createStudent();

      await membershipListener.onMembershipTerminated(
        new MembershipTerminatedEvent(
          student.membershipId,
          sharedTeacherId,
          '2026-09-07',
        ),
      );

      expect(await logFor(student.userId)).toEqual([
        {
          category: 'N-08',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
    });

    it('is not suppressible by mute — DB-CHK-09 refuses the row (BR-61)', async () => {
      const student = await createStudent();

      await expect(mute(student.userId, 'N-08')).rejects.toThrow(
        /account-critical/i,
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // N-01 — the highest-risk piece: per-timezone correctness + all six
  // §22.3 suppression conditions
  // ────────────────────────────────────────────────────────────────────

  describe('N-01 daily report not submitted → Student (mutable)', () => {
    it('reminds each student at THEIR OWN 20:00, eleven hours apart', async () => {
      const tunis = await createStudent({ timezone: TUNIS });
      const auckland = await createStudent({ timezone: AUCKLAND });

      await dailyReminder.evaluate(TUNIS_2000, TICK);
      expect(await logFor(tunis.userId)).toEqual([
        {
          category: 'N-01',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
      expect(await logFor(auckland.userId)).toEqual([]);

      await dailyReminder.evaluate(AUCKLAND_2000, TICK);
      expect(await logFor(auckland.userId)).toEqual([
        {
          category: 'N-01',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
    });

    it('reminds nobody on a tick that is 20:00 in neither timezone', async () => {
      const tunis = await createStudent({ timezone: TUNIS });
      const auckland = await createStudent({ timezone: AUCKLAND });

      await dailyReminder.evaluate(new Date('2026-09-07T12:00:00.000Z'), TICK);

      expect(await logFor(tunis.userId)).toEqual([]);
      expect(await logFor(auckland.userId)).toEqual([]);
      expect(pushedFor(tunis.membershipId)).toHaveLength(0);
      expect(pushedFor(auckland.membershipId)).toHaveLength(0);
    });

    describe('§22.3 suppression — all six conditions (FR-NOTIF-03)', () => {
      it('1. a Daily Report already exists for the student local today', async () => {
        const student = await createStudent();
        // 2026-09-07 is the student's local today at TUNIS_2000.
        await submitReport(student.membershipId, '2026-09-07');

        await dailyReminder.evaluate(TUNIS_2000, TICK);

        expect(await logFor(student.userId)).toEqual([
          {
            category: 'N-01',
            outcome: 'Suppressed',
            transport_reference: null,
          },
        ]);
        expect(pushedFor(student.membershipId)).toHaveLength(0);
      });

      it('2. today is the group recitation day', async () => {
        const student = await createStudent({ recitationDay: MONDAY });

        await dailyReminder.evaluate(TUNIS_2000, TICK);

        expect(await logFor(student.userId)).toEqual([
          {
            category: 'N-01',
            outcome: 'Suppressed',
            transport_reference: null,
          },
        ]);
      });

      it('3. the group lifecycle_state is Archived', async () => {
        const student = await createStudent({
          archivedAt: '2026-09-01T00:00:00.000Z',
        });

        await dailyReminder.evaluate(TUNIS_2000, TICK);

        // An archived group is filtered out of the candidate sweep AND
        // re-checked in dispatch; either way, nothing is sent.
        expect(await logFor(student.userId)).toEqual([]);
        expect(pushedFor(student.membershipId)).toHaveLength(0);
      });

      it('4. the Membership is not Active', async () => {
        const student = await createStudent({ terminated: true });

        await dailyReminder.evaluate(TUNIS_2000, TICK);

        expect(await logFor(student.userId)).toEqual([]);
        expect(pushedFor(student.membershipId)).toHaveLength(0);
      });

      it('5. the student has muted the category', async () => {
        const student = await createStudent();
        await mute(student.userId, 'N-01');

        await dailyReminder.evaluate(TUNIS_2000, TICK);

        expect(await logFor(student.userId)).toEqual([
          {
            category: 'N-01',
            outcome: 'Suppressed',
            transport_reference: null,
          },
        ]);
        expect(pushedFor(student.membershipId)).toHaveLength(0);
      });

      it('6. no valid device token exists (UC-15 E1)', async () => {
        const student = await createStudent({ withDevice: false });

        await dailyReminder.evaluate(TUNIS_2000, TICK);

        expect(await logFor(student.userId)).toEqual([
          {
            category: 'N-01',
            outcome: 'Suppressed',
            transport_reference: null,
          },
        ]);
        expect(pushedFor(student.membershipId)).toHaveLength(0);
      });

      it('6b. an invalidated token counts as no token (E-09)', async () => {
        const student = await createStudent();
        await dataSource.query(
          `UPDATE device_tokens SET invalidated_at = now() WHERE id = $1`,
          [student.deviceTokenId],
        );

        await dailyReminder.evaluate(TUNIS_2000, TICK);

        expect(await logFor(student.userId)).toEqual([
          {
            category: 'N-01',
            outcome: 'Suppressed',
            transport_reference: null,
          },
        ]);
      });

      it('re-checks the conditions inside dispatch, not only in the sweep', async () => {
        // Archived and terminated rows never reach dispatch through the
        // evaluator — they are filtered out of the candidate query. Calling
        // dispatch DIRECTLY for such a membership is what proves SA §21's
        // "re-check §22.3" step is the service's own, so a row that changes
        // state between the sweep and the send is still caught.
        const archived = await createStudent({
          archivedAt: '2026-09-01T00:00:00.000Z',
        });
        const terminated = await createStudent({ terminated: true });

        for (const student of [archived, terminated]) {
          const result = await notifications.dispatch(
            {
              type: 'N-01',
              resourceId: student.membershipId,
              recheckMembershipId: student.membershipId,
            },
            { userId: student.userId },
            'N-01',
            TUNIS_2000,
          );
          expect(result.outcome).toBe('Suppressed');
          expect(pushedFor(student.membershipId)).toHaveLength(0);
        }
        expect(
          (await logFor(archived.userId)).map((row) => row.outcome),
        ).toEqual(['Suppressed']);
        expect(
          (await logFor(terminated.userId)).map((row) => row.outcome),
        ).toEqual(['Suppressed']);
      });
    });

    it('marks a provider-rejected token invalidated and logs Failed (UC-15 E2)', async () => {
      const student = await createStudent();
      nextSendResult = {
        status: 'invalid-token',
        transportReference: null,
        detail: 'DeviceNotRegistered',
      };

      await dailyReminder.evaluate(TUNIS_2000, TICK);

      expect(await logFor(student.userId)).toEqual([
        { category: 'N-01', outcome: 'Failed', transport_reference: null },
      ]);
      const rows = await dataSource.query<
        Array<{ invalidated_at: Date | null }>
      >(`SELECT invalidated_at FROM device_tokens WHERE id = $1`, [
        student.deviceTokenId,
      ]);
      expect(rows[0].invalidated_at).not.toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // N-02 — start of the recitation day, student-local
  // ────────────────────────────────────────────────────────────────────

  describe('N-02 weekly report available → Student (mutable)', () => {
    it('fires at the local start of the recitation day, twelve hours apart', async () => {
      const tunis = await createStudent({ timezone: TUNIS });
      const auckland = await createStudent({ timezone: AUCKLAND });

      await weeklyAvailable.evaluate(AUCKLAND_FRIDAY_MIDNIGHT, TICK);
      expect(await logFor(auckland.userId)).toEqual([
        {
          category: 'N-02',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
      expect(await logFor(tunis.userId)).toEqual([]);

      await weeklyAvailable.evaluate(TUNIS_FRIDAY_MIDNIGHT, TICK);
      expect(await logFor(tunis.userId)).toEqual([
        {
          category: 'N-02',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
    });

    it('does not fire at local midnight of any other day', async () => {
      const student = await createStudent();

      // Local midnight entering Thursday 2026-09-10 in Tunis.
      await weeklyAvailable.evaluate(
        new Date('2026-09-09T23:00:00.000Z'),
        TICK,
      );

      expect(await logFor(student.userId)).toEqual([]);
    });

    it('is suppressed when the student has muted the category', async () => {
      const student = await createStudent();
      await mute(student.userId, 'N-02');

      await weeklyAvailable.evaluate(TUNIS_FRIDAY_MIDNIGHT, TICK);

      expect(await logFor(student.userId)).toEqual([
        { category: 'N-02', outcome: 'Suppressed', transport_reference: null },
      ]);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // N-06 / N-07 — ISS-17's once-per-cycle and once-per-episode cadence
  // ────────────────────────────────────────────────────────────────────

  describe('N-06 payment due soon → Student (mutable)', () => {
    /** Cycle 1 of a 2026-06-01 membership: 2026-09-01…2026-11-30. */
    const insideWindow = new Date('2026-11-25T00:00:00.000Z');

    it('fires ONCE when the cycle enters its final ten days, not daily', async () => {
      const student = await createStudent();

      for (const day of [20, 21, 22, 23, 24, 25]) {
        await paymentDueSoon.evaluate(new Date(`2026-11-${day}T12:00:00.000Z`));
      }

      expect(await logFor(student.userId)).toEqual([
        {
          category: 'N-06',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
      // ISS #135 left this path's guard per-RECIPIENT (the recipient is the
      // subject here — DB-UQ-02 allows one `Active` membership per user), and
      // the subject is recorded all the same.
      expect(await subjectsFor(student.userId)).toEqual([student.membershipId]);
    });

    it('does not fire before BR-33 ten-day window opens', async () => {
      const student = await createStudent();

      await paymentDueSoon.evaluate(new Date('2026-11-15T12:00:00.000Z'));

      expect(await logFor(student.userId)).toEqual([]);
    });

    it('does not fire when the current cycle is already paid', async () => {
      const student = await createStudent();
      await dataSource.query(
        `INSERT INTO payment_records (id, membership_id, cycle_index, amount, recorded_by)
         VALUES ($1, $2, 1, 30.00, $3)`,
        [uuidv7(), student.membershipId, sharedAssistantId],
      );

      await paymentDueSoon.evaluate(insideWindow);

      expect(await logFor(student.userId)).toEqual([]);
    });

    it('is suppressed when the student has muted the category', async () => {
      const student = await createStudent();
      await mute(student.userId, 'N-06');

      await paymentDueSoon.evaluate(insideWindow);

      expect(await logFor(student.userId)).toEqual([
        { category: 'N-06', outcome: 'Suppressed', transport_reference: null },
      ]);
    });

    it('a Suppressed decision also closes the cycle — no daily retry', async () => {
      const student = await createStudent();
      await mute(student.userId, 'N-06');

      await paymentDueSoon.evaluate(insideWindow);
      await paymentDueSoon.evaluate(new Date('2026-11-26T00:00:00.000Z'));
      await paymentDueSoon.evaluate(new Date('2026-11-27T00:00:00.000Z'));

      expect(await logFor(student.userId)).toHaveLength(1);
    });
  });

  describe('N-07 student at risk → Teacher of the group (mutable)', () => {
    /** Monday 2026-09-07 in Tunis; the fixture group recites on Friday. */
    const evaluationDay = new Date('2026-09-07T01:00:00.000Z');

    async function teacherWithDevice(): Promise<string> {
      const teacherId = await createUser('Teacher', TUNIS);
      await registerDevice(teacherId);
      return teacherId;
    }

    async function groupFor(teacherId: string): Promise<string> {
      const id = uuidv7();
      await dataSource.query(
        `INSERT INTO groups (
           id, name, gender, recitation_day, enrollment_status,
           lifecycle_state, teacher_id, assistant_id, created_by
         ) VALUES ($1, $2, 'Male', $3, 'Closed', 'Active', $4, $5, $4)`,
        [
          id,
          `${testGroupPrefix} ${uuidv7()}`,
          FRIDAY,
          teacherId,
          sharedAssistantId,
        ],
      );
      return id;
    }

    it('notifies the TEACHER, once per episode, not daily while it persists', async () => {
      const teacherId = await teacherWithDevice();
      const student = await createStudent({
        groupId: await groupFor(teacherId),
      });
      await submitReport(student.membershipId, '2026-09-02');

      await atRisk.evaluate(evaluationDay);
      await atRisk.evaluate(new Date('2026-09-08T01:00:00.000Z'));
      await atRisk.evaluate(new Date('2026-09-09T01:00:00.000Z'));

      expect(await logFor(teacherId)).toEqual([
        {
          category: 'N-07',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
      // The at-risk STUDENT is never the recipient of N-07.
      expect(await logFor(student.userId)).toEqual([]);
      expect(pushedFor(student.membershipId)).toEqual([
        { eventType: 'N-07', resourceId: student.membershipId },
      ]);
    });

    it('stays silent below the three-expected-day threshold (DS-04)', async () => {
      const teacherId = await teacherWithDevice();
      const student = await createStudent({
        groupId: await groupFor(teacherId),
      });
      await submitReport(student.membershipId, '2026-09-05');

      await atRisk.evaluate(evaluationDay);

      expect(await logFor(teacherId)).toEqual([]);
    });

    it('notifies again for a NEW episode after a report broke the streak', async () => {
      const teacherId = await teacherWithDevice();
      const student = await createStudent({
        groupId: await groupFor(teacherId),
      });
      await submitReport(student.membershipId, '2026-09-02');

      await atRisk.evaluate(evaluationDay);
      expect(await logFor(teacherId)).toHaveLength(1);

      // The student reports, then relapses.
      await submitReport(student.membershipId, '2026-09-08');
      await atRisk.evaluate(new Date('2026-09-13T01:00:00.000Z'));

      expect(await logFor(teacherId)).toHaveLength(2);
    });

    it("notifies ONCE PER STUDENT when two of a Teacher's students are at risk (#135)", async () => {
      const teacherId = await teacherWithDevice();
      const groupId = await groupFor(teacherId);
      const first = await createStudent({ groupId });
      const second = await createStudent({ groupId });
      // Both last reported on the same day, so both episodes are open in the
      // SAME window — the shape that used to collapse into one notification.
      await submitReport(first.membershipId, '2026-09-02');
      await submitReport(second.membershipId, '2026-09-02');

      await atRisk.evaluate(evaluationDay);

      const rows = await subjectLogFor(teacherId);
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.category === 'N-07')).toBe(true);
      expect(rows.every((row) => row.outcome === 'Sent')).toBe(true);
      expect([...rows.map((row) => row.subject_id)].sort()).toEqual(
        [first.membershipId, second.membershipId].sort(),
      );
      expect(pushedFor(first.membershipId)).toEqual([
        { eventType: 'N-07', resourceId: first.membershipId },
      ]);
      expect(pushedFor(second.membershipId)).toEqual([
        { eventType: 'N-07', resourceId: second.membershipId },
      ]);

      // …and neither repeats on the next tick: the once-per-episode
      // guarantee still holds, now PER STUDENT (SAS §22.3, SA.md:521).
      await atRisk.evaluate(new Date('2026-09-08T01:00:00.000Z'));
      await atRisk.evaluate(new Date('2026-09-09T01:00:00.000Z'));

      expect(await subjectLogFor(teacherId)).toHaveLength(2);
    });

    it('opens a new episode for ONE student without re-notifying the other', async () => {
      const teacherId = await teacherWithDevice();
      const groupId = await groupFor(teacherId);
      const steady = await createStudent({ groupId });
      const relapsing = await createStudent({ groupId });
      await submitReport(steady.membershipId, '2026-09-02');
      await submitReport(relapsing.membershipId, '2026-09-02');

      await atRisk.evaluate(evaluationDay);
      expect(await subjectLogFor(teacherId)).toHaveLength(2);

      // Only `relapsing` reports and then relapses; `steady` never reports
      // again, so its episode — and its guard window — is unchanged.
      await submitReport(relapsing.membershipId, '2026-09-08');
      await atRisk.evaluate(new Date('2026-09-13T01:00:00.000Z'));

      const rows = await subjectLogFor(teacherId);
      expect(rows).toHaveLength(3);
      expect(
        rows.filter((row) => row.subject_id === relapsing.membershipId),
      ).toHaveLength(2);
      expect(
        rows.filter((row) => row.subject_id === steady.membershipId),
      ).toHaveLength(1);
    });

    it('is suppressed when the Teacher has muted the category', async () => {
      const teacherId = await teacherWithDevice();
      await mute(teacherId, 'N-07');
      const student = await createStudent({
        groupId: await groupFor(teacherId),
      });
      await submitReport(student.membershipId, '2026-09-02');

      await atRisk.evaluate(evaluationDay);

      expect(await logFor(teacherId)).toEqual([
        { category: 'N-07', outcome: 'Suppressed', transport_reference: null },
      ]);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // N-04 on DE-10 — DS-07's auto-rejection reaching its applicants (#133)
  // ────────────────────────────────────────────────────────────────────

  describe('N-04 on group archival → every auto-rejected Applicant', () => {
    interface Applicant {
      userId: string;
      joinRequestId: string;
    }

    /**
     * One `Pending` JoinRequest, inserted directly: this suite is about what
     * ARCHIVAL does to it, and API-012's own validation is covered by the
     * enrollment suites. The VO-08 columns carry fixture values inside every
     * CHECK the DBT-03 table declares.
     */
    async function pendingRequest(
      userId: string,
      groupId: string,
    ): Promise<string> {
      const id = uuidv7();
      await dataSource.query(
        `INSERT INTO join_requests (
           id, user_id, group_id, full_name, gender, age, phone_number,
           occupation, city, memorized_hizb_count, tajweed_level,
           studied_tajweed_theory, studied_qalun, fee_agreement,
           program_goal, score, status
         ) VALUES ($1, $2, $3, $4, 'Male', 24, '20000000', 'طالب', 'تونس',
                   10, 'Intermediate', true, true, true, 'Memorization',
                   55.00, 'Pending')`,
        [id, userId, groupId, `مترشح ${id.slice(0, 6)}`],
      );
      return id;
    }

    async function applicantOf(groupId: string): Promise<Applicant> {
      const userId = await createUser('User', TUNIS);
      await registerDevice(userId);
      return { userId, joinRequestId: await pendingRequest(userId, groupId) };
    }

    async function archive(groupId: string): Promise<void> {
      const admin = await loginAsAdmin();
      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${groupId}/lifecycle`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.OK);
    }

    async function requestRow(joinRequestId: string): Promise<{
      status: string;
      resolution_source: string | null;
      reviewed_by: string | null;
    }> {
      const rows = await dataSource.query<
        Array<{
          status: string;
          resolution_source: string | null;
          reviewed_by: string | null;
        }>
      >(
        `SELECT status, resolution_source, reviewed_by
           FROM join_requests WHERE id = $1`,
        [joinRequestId],
      );
      return rows[0];
    }

    it('tells every applicant of the archived group, and nobody else', async () => {
      const archivedGroup = await createGroup();
      const otherGroup = await createGroup();
      const applicants = [
        await applicantOf(archivedGroup),
        await applicantOf(archivedGroup),
        await applicantOf(archivedGroup),
      ];
      const bystander = await applicantOf(otherGroup);

      await archive(archivedGroup);

      // Each of the three learns their own application ended (SAS §22.2
      // N-04: "Assistant rejects, or auto-rejection on archival (UC-13)").
      for (const applicant of applicants) {
        const rows = await eventuallyLoggedCount(applicant.userId, 1);
        expect(rows).toEqual([
          {
            category: 'N-04',
            outcome: 'Sent',
            subject_id: applicant.joinRequestId,
          },
        ]);
        expect(pushedFor(applicant.joinRequestId)).toEqual([
          { eventType: 'N-04', resourceId: applicant.joinRequestId },
        ]);
        // DS-07 / EC-10 / FR-REQ-08, and DMS DS-07 on who decided it: the
        // system did, so `resolution_source` says so and `reviewed_by`
        // stays NULL — no user performed this rejection.
        expect(await requestRow(applicant.joinRequestId)).toEqual({
          status: 'Rejected',
          resolution_source: 'system',
          reviewed_by: null,
        });
      }

      // The other group's queue is untouched, in the table and in the log.
      expect(await requestRow(bystander.joinRequestId)).toEqual({
        status: 'Pending',
        resolution_source: null,
        reviewed_by: null,
      });
      expect(await subjectLogFor(bystander.userId)).toEqual([]);
      expect(pushedFor(bystander.joinRequestId)).toHaveLength(0);
    });

    it('does not double-notify when DE-10 is delivered twice', async () => {
      const group = await createGroup();
      const applicant = await applicantOf(group);

      await archive(group);
      await eventuallyLoggedCount(applicant.userId, 1);

      // Re-deliver the very same event — the shape a retried or duplicated
      // in-process emit would take. The guard is the `notification_log` row
      // the first delivery wrote, read per (recipient, subject).
      const rows = await dataSource.query<Array<{ archived_at: Date }>>(
        `SELECT archived_at FROM groups WHERE id = $1`,
        [group],
      );
      await groupListener.onGroupArchived(
        new GroupArchivedEvent(group, rows[0].archived_at, [
          applicant.joinRequestId,
        ]),
      );

      expect(await subjectLogFor(applicant.userId)).toEqual([
        {
          category: 'N-04',
          outcome: 'Sent',
          subject_id: applicant.joinRequestId,
        },
      ]);
      expect(pushedFor(applicant.joinRequestId)).toHaveLength(1);
    });

    it('archiving a group with no pending requests notifies nobody', async () => {
      const group = await createGroup();
      const before = await dataSource.query<Array<{ count: string }>>(
        `SELECT count(*)::text AS count FROM notification_log`,
      );

      await archive(group);

      const after = await dataSource.query<Array<{ count: string }>>(
        `SELECT count(*)::text AS count FROM notification_log`,
      );
      expect(after[0].count).toBe(before[0].count);
    });

    it('answers 200 with the transport down — dispatch never blocks archival', async () => {
      const group = await createGroup();
      const applicant = await applicantOf(group);
      sendThrows = true;

      const admin = await loginAsAdmin();
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group}/lifecycle`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ lifecycle_state: 'Archived' });

      expect(response.status).toBe(HttpStatus.OK);
      // BR-60 / ADR-032: the rejection stands and the failure is recorded,
      // not thrown (FR-NOTIF-08).
      const rows = await eventuallyLoggedCount(applicant.userId, 1);
      expect(rows).toEqual([
        {
          category: 'N-04',
          outcome: 'Failed',
          subject_id: applicant.joinRequestId,
        },
      ]);
      expect((await requestRow(applicant.joinRequestId)).status).toBe(
        'Rejected',
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // ADR-032 / AGENTS §8 — the transport can never reach the request
  // ────────────────────────────────────────────────────────────────────

  describe('EventEmitter2 wiring — the listeners are reachable from a request', () => {
    it('DELETE /memberships/{id} produces the N-08 row through the real event bus', async () => {
      const student = await createStudent();
      const admin = await loginAsAdmin();

      await request(app.getHttpServer())
        .delete(`/api/v1/memberships/${student.membershipId}`)
        .set('Authorization', `Bearer ${admin}`)
        .expect(HttpStatus.OK);

      // ADR-032: the use case does not await its listener, so the row lands
      // after the response. Poll rather than assume an ordering.
      const rows = await eventuallyLogged(student.userId);

      expect(rows).toEqual([
        {
          category: 'N-08',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
      expect(pushedFor(student.membershipId)).toEqual([
        { eventType: 'N-08', resourceId: student.membershipId },
      ]);
    });
  });

  describe('External-service failure never surfaces on the triggering request', () => {
    it('DELETE /memberships/{id} still answers 200 with the transport down', async () => {
      const student = await createStudent();
      const admin = await loginAsAdmin();
      sendThrows = true;

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/memberships/${student.membershipId}`)
        .set('Authorization', `Bearer ${admin}`);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data).toEqual({
        membership_id: student.membershipId,
        state: 'Terminated',
      });

      // The listener runs fire-and-forget after the response. Wait for the
      // outcome row rather than a fixed delay, so nothing this suite
      // started is still in flight when it finishes — and confirm the
      // transport failure was recorded, not thrown (FR-NOTIF-08), while
      // the removal itself stands (BR-60).
      const logged = await eventuallyLogged(student.userId);
      expect(logged).toEqual([
        { category: 'N-08', outcome: 'Failed', transport_reference: null },
      ]);
      const rows = await dataSource.query<Array<{ state: string }>>(
        `SELECT state FROM memberships WHERE id = $1`,
        [student.membershipId],
      );
      expect(rows[0].state).toBe('Terminated');
    });

    it('records Failed rather than throwing when the transport rejects', async () => {
      const applicant = await createUser('User', TUNIS);
      await registerDevice(applicant);
      sendThrows = true;

      await expect(
        enrollmentListener.onJoinRequestAccepted(
          new JoinRequestAcceptedEvent(uuidv7(), uuidv7(), applicant),
        ),
      ).resolves.toBeUndefined();

      expect(await logFor(applicant)).toEqual([
        { category: 'N-03', outcome: 'Failed', transport_reference: null },
      ]);
    });
  });
});
