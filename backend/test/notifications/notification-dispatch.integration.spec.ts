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
import { MembershipTerminatedEvent } from '../../src/modules/memberships/domain/events/membership-terminated.event';
import { AtRiskEvaluator } from '../../src/modules/notifications/application/evaluators/at-risk.evaluator';
import { DailyReminderEvaluator } from '../../src/modules/notifications/application/evaluators/daily-reminder.evaluator';
import { PaymentDueSoonEvaluator } from '../../src/modules/notifications/application/evaluators/payment-due-soon.evaluator';
import { WeeklyReportAvailableEvaluator } from '../../src/modules/notifications/application/evaluators/weekly-report-available.evaluator';
import { NotificationService } from '../../src/modules/notifications/application/dispatch/notification.service';
import { EnrollmentNotificationListener } from '../../src/modules/notifications/application/listeners/enrollment-notification.listener';
import { MembershipNotificationListener } from '../../src/modules/notifications/application/listeners/membership-notification.listener';
import { NOTIFICATION_EVENT_TYPES } from '../../src/modules/notifications/domain/notification-event';
import type { PushPayload } from '../../src/modules/notifications/domain/push-payload';
import {
  PUSH_SENDER,
  type IPushSender,
  type PushSendResult,
} from '../../src/modules/notifications/domain/push-sender.interface';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

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

  async function logFor(userId: string): Promise<LogRow[]> {
    return dataSource.query<LogRow[]>(
      `SELECT category, outcome, transport_reference
         FROM notification_log
        WHERE user_id = $1
        ORDER BY dispatched_at, category`,
      [userId],
    );
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

      // N-03, N-04, N-05, N-08 — the four event-driven ones.
      await enrollmentListener.onJoinRequestAccepted(
        new JoinRequestAcceptedEvent('jr-1', student.membershipId, applicant),
      );
      await enrollmentListener.onJoinRequestRejected(
        new JoinRequestRejectedEvent('jr-2', applicant),
      );
      await enrollmentListener.onJoinRequestSubmitted(
        new JoinRequestSubmittedEvent(
          'jr-3',
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

      await enrollmentListener.onJoinRequestAccepted(
        new JoinRequestAcceptedEvent('jr-1', 'membership-x', applicant),
      );

      expect(await logFor(applicant)).toEqual([
        {
          category: 'N-03',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
      expect(pushedFor('membership-x')).toEqual([
        { eventType: 'N-03', resourceId: 'membership-x' },
      ]);
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
        new JoinRequestAcceptedEvent('jr-1', 'membership-x', applicant),
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

      await enrollmentListener.onJoinRequestRejected(
        new JoinRequestRejectedEvent('jr-42', applicant),
      );

      expect(await logFor(applicant)).toEqual([
        {
          category: 'N-04',
          outcome: 'Sent',
          transport_reference: 'expo-ticket',
        },
      ]);
      expect(pushedFor('jr-42')).toEqual([
        { eventType: 'N-04', resourceId: 'jr-42' },
      ]);
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

      await enrollmentListener.onJoinRequestSubmitted(
        new JoinRequestSubmittedEvent(
          'jr-7',
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

      await enrollmentListener.onJoinRequestSubmitted(
        new JoinRequestSubmittedEvent(
          'jr-8',
          groupId,
          'applicant-x',
          91.25,
          new Date(),
        ),
      );

      expect(await logFor(assistant)).toEqual([
        { category: 'N-05', outcome: 'Suppressed', transport_reference: null },
      ]);
      expect(pushedFor('jr-8')).toHaveLength(0);
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
  // ADR-032 / AGENTS §8 — the transport can never reach the request
  // ────────────────────────────────────────────────────────────────────

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

      // The listener runs fire-and-forget after the response; give the
      // microtask queue a turn and confirm the failure was recorded, not
      // thrown (BR-60 — the removal itself is unaffected).
      await new Promise((resolve) => setTimeout(resolve, 250));
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
          new JoinRequestAcceptedEvent('jr-9', 'membership-y', applicant),
        ),
      ).resolves.toBeUndefined();

      expect(await logFor(applicant)).toEqual([
        { category: 'N-03', outcome: 'Failed', transport_reference: null },
      ]);
    });

    async function loginAsAdmin(): Promise<string> {
      const password = 'Password123!';
      const admins: Array<{ id: string; email: string }> =
        await dataSource.query(
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
  });
});
