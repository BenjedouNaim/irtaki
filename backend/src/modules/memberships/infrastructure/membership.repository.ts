import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CreateMembershipRecordProps,
  IMembershipRepository,
  OwnActiveMembershipRecord,
  RosterRow,
} from '../domain/membership.repository.interface';
import { Membership } from '../domain/membership.entity';
import { MembershipTypeOrmEntity } from './membership.typeorm-entity';
import { GroupTypeOrmEntity } from '../../groups/infrastructure/group.typeorm-entity';
import { UserTypeOrmEntity } from '../../identity/infrastructure/user.typeorm-entity';

interface RawOwnActiveMembershipRow {
  membership_id: string;
  group_id: string;
  group_name: string;
  recitation_day: number | string;
  enrollment_status: string;
  started_at: string;
  state: 'Active';
}

interface RawRosterRow {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  gender: string | null;
  started_at: string;
  state: 'Active' | 'Terminated';
}

interface RawMembershipRecoveryRow {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  gender: string | null;
  group_id: string;
  group_name: string;
  recitation_day: number | string;
  enrollment_status: string;
  started_at: string;
  ended_at: string | null;
  ended_by: string | null;
  state: 'Active' | 'Terminated';
}

interface RawDailyReportRow {
  id: string;
  membership_id: string;
  report_date: string | Date;
  type: string;
  submitted_at: string | Date;
  submitted_timezone: string;
  no_memorization_today: boolean | null;
  memo_from_ordinal: number | null;
  memo_to_ordinal: number | null;
  memo_time_from: string | null;
  memo_time_to: string | null;
  completed_50_repetitions: boolean | null;
  repetitions_in_single_session: boolean | null;
  no_revision_today: boolean | null;
  rev_from_ordinal: number | null;
  rev_to_ordinal: number | null;
  rev_time_from: string | null;
  rev_time_to: string | null;
  read_tafsir: boolean | null;
  absence_reason: string | null;
  deleted_at: string | Date;
}

interface RawWeeklyReportRow {
  id: string;
  membership_id: string;
  week_start: string | Date;
  week_end: string | Date;
  expected_days: number | string;
  missed_daily_reports: number | string;
  missed_daily_memorization: number | string;
  missed_daily_revision: number | string;
  missed_50_repetitions: number | string;
  missed_single_session: number | string;
  attended_recitation_call: boolean;
  state: string;
  finalised_at: string | Date | null;
  finalised_by: string | null;
  deleted_at: string | Date;
}

interface RawPaymentRecordRow {
  id: string;
  membership_id: string;
  cycle_index: number | string;
  amount: string | number;
  paid_at: string | Date;
  recorded_by: string;
  deleted_at: string | Date;
}

function toIsoString(val: Date | string | null | undefined): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString();
  const d = new Date(val);
  return isNaN(d.getTime()) ? String(val) : d.toISOString();
}

function toNullableIsoString(
  val: Date | string | null | undefined,
): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  const d = new Date(val);
  return isNaN(d.getTime()) ? String(val) : d.toISOString();
}

function toDateString(val: Date | string | null | undefined): string {
  if (!val) return '';
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(val);
}

function toNullableDateString(
  val: Date | string | null | undefined,
): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(val);
}

@Injectable()
export class MembershipRepository implements IMembershipRepository {
  constructor(
    @InjectRepository(MembershipTypeOrmEntity)
    private readonly membershipRepo: Repository<MembershipTypeOrmEntity>,
  ) {}

  async create(
    props: CreateMembershipRecordProps,
    manager: EntityManager,
  ): Promise<{ id: string; startedAt: string }> {
    const domain = Membership.createFromAcceptance(props);

    const entity = manager.create(MembershipTypeOrmEntity, {
      id: domain.id,
      userId: domain.userId,
      groupId: domain.groupId,
      joinRequestId: domain.joinRequestId,
      state: domain.state,
      startedAt: domain.startedAt,
      endedAt: domain.endedAt,
      endedBy: domain.endedBy,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    });

    await manager.save(MembershipTypeOrmEntity, entity);

    return {
      id: domain.id,
      startedAt: domain.startedAt,
    };
  }

  async findActiveByUserId(
    userId: string,
  ): Promise<OwnActiveMembershipRecord | null> {
    const row = await this.membershipRepo
      .createQueryBuilder('m')
      .innerJoin(GroupTypeOrmEntity, 'g', 'g.id = m.group_id')
      .where('m.user_id = :userId', { userId })
      .andWhere('m.state = :state', { state: 'Active' })
      .select([
        'm.id AS membership_id',
        'g.id AS group_id',
        'g.name AS group_name',
        'g.recitation_day AS recitation_day',
        'g.enrollment_status AS enrollment_status',
        'm.started_at::text AS started_at',
        'm.state AS state',
      ])
      .getRawOne<RawOwnActiveMembershipRow>();

    if (!row) {
      return null;
    }

    return {
      id: row.membership_id,
      group: {
        id: row.group_id,
        name: row.group_name,
        recitationDay: Number(row.recitation_day),
        enrollmentStatus: row.enrollment_status,
      },
      startedAt: row.started_at,
      state: 'Active',
    };
  }

  async findRosterByGroupId(
    groupId: string,
    options: { asOf?: string },
  ): Promise<RosterRow[]> {
    const qb = this.membershipRepo
      .createQueryBuilder('m')
      .leftJoin(UserTypeOrmEntity, 'u', 'u.id = m.user_id')
      .where('m.group_id = :groupId', { groupId });

    if (options.asOf) {
      qb.andWhere('m.started_at <= :asOf', { asOf: options.asOf }).andWhere(
        '(m.ended_at IS NULL OR m.ended_at >= :asOf)',
        { asOf: options.asOf },
      );
    } else {
      qb.andWhere('m.state = :state', { state: 'Active' });
    }

    const rows = await qb
      .select([
        'm.id AS membership_id',
        'm.user_id AS user_id',
        'u.full_name AS full_name',
        'u.gender AS gender',
        'm.started_at::text AS started_at',
        'm.state AS state',
      ])
      .orderBy('u.full_name', 'ASC')
      .getRawMany<RawRosterRow>();

    return rows.map((row) => ({
      id: row.membership_id,
      userId: row.user_id,
      fullName: row.full_name ?? null,
      gender: row.gender ?? null,
      startedAt: row.started_at,
      state: row.state,
    }));
  }

  async findByIdForRecovery(
    id: string,
  ): Promise<import('../domain/membership.repository.interface').MembershipRecoveryData | null> {
    const membershipRow = await this.membershipRepo
      .createQueryBuilder('m')
      .innerJoin(GroupTypeOrmEntity, 'g', 'g.id = m.group_id')
      .leftJoin(UserTypeOrmEntity, 'u', 'u.id = m.user_id')
      .where('m.id = :id', { id })
      .select([
        'm.id AS membership_id',
        'm.user_id AS user_id',
        'u.full_name AS full_name',
        'u.gender AS gender',
        'g.id AS group_id',
        'g.name AS group_name',
        'g.recitation_day AS recitation_day',
        'g.enrollment_status AS enrollment_status',
        'm.started_at::text AS started_at',
        'm.ended_at::text AS ended_at',
        'm.ended_by AS ended_by',
        'm.state AS state',
      ])
      .getRawOne<RawMembershipRecoveryRow>();

    if (!membershipRow) {
      return null;
    }

    const dailyReportRows: RawDailyReportRow[] =
      await this.membershipRepo.manager.query(
        `SELECT 
          id,
          membership_id,
          report_date::text AS report_date,
          type,
          submitted_at,
          submitted_timezone,
          no_memorization_today,
          memo_from_ordinal,
          memo_to_ordinal,
          memo_time_from::text AS memo_time_from,
          memo_time_to::text AS memo_time_to,
          completed_50_repetitions,
          repetitions_in_single_session,
          no_revision_today,
          rev_from_ordinal,
          rev_to_ordinal,
          rev_time_from::text AS rev_time_from,
          rev_time_to::text AS rev_time_to,
          read_tafsir,
          absence_reason,
          deleted_at
         FROM daily_reports
         WHERE membership_id = $1 AND deleted_at IS NOT NULL
         ORDER BY report_date ASC, submitted_at ASC`,
        [id],
      );

    const weeklyReportRows: RawWeeklyReportRow[] =
      await this.membershipRepo.manager.query(
        `SELECT
          id,
          membership_id,
          week_start::text AS week_start,
          week_end::text AS week_end,
          expected_days,
          missed_daily_reports,
          missed_daily_memorization,
          missed_daily_revision,
          missed_50_repetitions,
          missed_single_session,
          attended_recitation_call,
          state,
          finalised_at,
          finalised_by,
          deleted_at
         FROM weekly_reports
         WHERE membership_id = $1 AND deleted_at IS NOT NULL
         ORDER BY week_start ASC`,
        [id],
      );

    const paymentRecordRows: RawPaymentRecordRow[] =
      await this.membershipRepo.manager.query(
        `SELECT
          id,
          membership_id,
          cycle_index,
          amount,
          paid_at,
          recorded_by,
          deleted_at
         FROM payment_records
         WHERE membership_id = $1 AND deleted_at IS NOT NULL
         ORDER BY cycle_index ASC, paid_at ASC`,
        [id],
      );

    return {
      membership: {
        id: membershipRow.membership_id,
        user: {
          id: membershipRow.user_id,
          fullName: membershipRow.full_name ?? null,
          gender: membershipRow.gender ?? null,
        },
        group: {
          id: membershipRow.group_id,
          name: membershipRow.group_name,
          recitationDay: Number(membershipRow.recitation_day),
          enrollmentStatus: membershipRow.enrollment_status,
        },
        state: membershipRow.state,
        startedAt: toDateString(membershipRow.started_at),
        endedAt: toNullableDateString(membershipRow.ended_at),
        endedBy: membershipRow.ended_by ?? null,
      },
      dailyReports: dailyReportRows.map((r) => ({
        id: r.id,
        membershipId: r.membership_id,
        reportDate: toDateString(r.report_date),
        type: r.type,
        submittedAt: toIsoString(r.submitted_at),
        submittedTimezone: r.submitted_timezone,
        noMemorizationToday: r.no_memorization_today ?? null,
        memoFromOrdinal: r.memo_from_ordinal != null ? Number(r.memo_from_ordinal) : null,
        memoToOrdinal: r.memo_to_ordinal != null ? Number(r.memo_to_ordinal) : null,
        memoTimeFrom: r.memo_time_from ? String(r.memo_time_from) : null,
        memoTimeTo: r.memo_time_to ? String(r.memo_time_to) : null,
        completed50Repetitions: r.completed_50_repetitions ?? null,
        repetitionsInSingleSession: r.repetitions_in_single_session ?? null,
        noRevisionToday: r.no_revision_today ?? null,
        revFromOrdinal: r.rev_from_ordinal != null ? Number(r.rev_from_ordinal) : null,
        revToOrdinal: r.rev_to_ordinal != null ? Number(r.rev_to_ordinal) : null,
        revTimeFrom: r.rev_time_from ? String(r.rev_time_from) : null,
        revTimeTo: r.rev_time_to ? String(r.rev_time_to) : null,
        readTafsir: r.read_tafsir ?? null,
        absenceReason: r.absence_reason ?? null,
        deletedAt: toIsoString(r.deleted_at),
      })),
      weeklyReports: weeklyReportRows.map((r) => ({
        id: r.id,
        membershipId: r.membership_id,
        weekStart: toDateString(r.week_start),
        weekEnd: toDateString(r.week_end),
        expectedDays: Number(r.expected_days),
        missedDailyReports: Number(r.missed_daily_reports),
        missedDailyMemorization: Number(r.missed_daily_memorization),
        missedDailyRevision: Number(r.missed_daily_revision),
        missed50Repetitions: Number(r.missed_50_repetitions),
        missedSingleSession: Number(r.missed_single_session),
        attendedRecitationCall: Boolean(r.attended_recitation_call),
        state: r.state,
        finalisedAt: toNullableIsoString(r.finalised_at),
        finalisedBy: r.finalised_by ?? null,
        deletedAt: toIsoString(r.deleted_at),
      })),
      paymentRecords: paymentRecordRows.map((r) => ({
        id: r.id,
        membershipId: r.membership_id,
        cycleIndex: Number(r.cycle_index),
        amount: typeof r.amount === 'number' ? r.amount.toFixed(2) : String(r.amount),
        paidAt: toIsoString(r.paid_at),
        recordedBy: r.recorded_by,
        deletedAt: toIsoString(r.deleted_at),
      })),
    };
  }

  async findStateAndUserById(
    membershipId: string,
    manager: EntityManager,
  ): Promise<{ userId: string; state: string } | null> {
    const queryResult: unknown = await manager.query(
      `SELECT user_id AS "userId", state FROM memberships WHERE id = $1 LIMIT 1`,
      [membershipId],
    );

    const rows = (
      Array.isArray(queryResult) && Array.isArray(queryResult[0])
        ? queryResult[0]
        : Array.isArray(queryResult)
          ? queryResult
          : []
    ) as Array<{ userId: string; state: string }>;

    if (!rows || rows.length === 0) {
      return null;
    }

    return { userId: rows[0].userId, state: rows[0].state };
  }

  async terminateConditionally(
    membershipId: string,
    endedBy: string,
    endedAt: string,
    manager: EntityManager,
  ): Promise<{ userId: string; joinRequestId: string | null } | null> {
    const updateResult: unknown = await manager.query(
      `UPDATE memberships
       SET state = 'Terminated',
           ended_at = $3::date,
           ended_by = $2,
           updated_at = now()
       WHERE id = $1 AND state = 'Active'
       RETURNING user_id AS "userId", join_request_id AS "joinRequestId"`,
      [membershipId, endedBy, endedAt],
    );

    const rows = (
      Array.isArray(updateResult) && Array.isArray(updateResult[0])
        ? updateResult[0]
        : Array.isArray(updateResult)
          ? updateResult
          : []
    ) as Array<{ userId: string; joinRequestId: string | null }>;

    if (!rows || rows.length === 0) {
      return null;
    }

    return {
      userId: rows[0].userId,
      joinRequestId: rows[0].joinRequestId ?? null,
    };
  }

  async softDeleteMembershipRecords(
    membershipId: string,
    joinRequestId: string | null,
    manager: EntityManager,
  ): Promise<void> {
    // AR-04 cohesion: termination and its cascade must land in one transaction so a crash can never leave live records pointing at a Terminated membership.
    await manager.query(
      `UPDATE daily_reports SET deleted_at = now() WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );
    await manager.query(
      `UPDATE weekly_reports SET deleted_at = now() WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );
    await manager.query(
      `UPDATE payment_records SET deleted_at = now() WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );
    if (joinRequestId) {
      await manager.query(
        `UPDATE join_requests SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
        [joinRequestId],
      );
    }
    await manager.query(
      `UPDATE memorization_coverage SET deleted_at = now(), updated_at = now() WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );
  }
}
