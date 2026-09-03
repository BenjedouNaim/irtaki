import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GroupArchivalResult,
  GroupLifecycleTransition,
  GroupListRow,
  IGroupRepository,
} from '../domain/group.repository.interface';
import { GroupTypeOrmEntity } from './group.typeorm-entity';
import { MembershipTypeOrmEntity } from './membership.typeorm-entity';
import { UserTypeOrmEntity } from '../../identity/infrastructure/user.typeorm-entity';

interface RawGroupListRow {
  id: string;
  name: string;
  gender: string;
  recitation_day: number | string;
  enrollment_status: string;
  lifecycle_state: string;
  created_at: string | Date;
  teacher_id: string;
  teacher_full_name: string | null;
  assistant_id: string;
  assistant_full_name: string | null;
}

@Injectable()
export class GroupRepository implements IGroupRepository {
  constructor(
    @InjectRepository(GroupTypeOrmEntity)
    private readonly groupRepo: Repository<GroupTypeOrmEntity>,
  ) {}

  async findAllForList(): Promise<GroupListRow[]> {
    const rows = await this.groupRepo
      .createQueryBuilder('g')
      .leftJoin(UserTypeOrmEntity, 't', 't.id = g.teacher_id')
      .leftJoin(UserTypeOrmEntity, 'a', 'a.id = g.assistant_id')
      .select([
        'g.id AS id',
        'g.name AS name',
        'g.gender AS gender',
        'g.recitation_day AS recitation_day',
        'g.enrollment_status AS enrollment_status',
        'g.lifecycle_state AS lifecycle_state',
        'g.created_at AS created_at',
        't.id AS teacher_id',
        't.full_name AS teacher_full_name',
        'a.id AS assistant_id',
        'a.full_name AS assistant_full_name',
      ])
      .orderBy('g.created_at', 'DESC')
      .getRawMany<RawGroupListRow>();

    return rows.map((r) => this.mapRawToGroupListRow(r));
  }

  /**
   * API-009's Admin `group_count`. Archived groups are counted: `GET /groups`
   * returns them too (APIS §10.4 declares no lifecycle filter), and SCR-27 —
   * the list this tile taps into (UF §10) — shows them with a lifecycle
   * badge, so a tile that excluded them would contradict the screen it opens.
   */
  async countAll(): Promise<number> {
    const rows = await this.groupRepo.query<Array<{ count: number }>>(
      'SELECT COUNT(*)::int AS count FROM groups',
    );

    return rows[0]?.count ?? 0;
  }

  async findByStaffIdForList(staffId: string): Promise<GroupListRow[]> {
    const rows = await this.groupRepo
      .createQueryBuilder('g')
      .leftJoin(UserTypeOrmEntity, 't', 't.id = g.teacher_id')
      .leftJoin(UserTypeOrmEntity, 'a', 'a.id = g.assistant_id')
      .where('g.teacher_id = :staffId OR g.assistant_id = :staffId', {
        staffId,
      })
      .select([
        'g.id AS id',
        'g.name AS name',
        'g.gender AS gender',
        'g.recitation_day AS recitation_day',
        'g.enrollment_status AS enrollment_status',
        'g.lifecycle_state AS lifecycle_state',
        'g.created_at AS created_at',
        't.id AS teacher_id',
        't.full_name AS teacher_full_name',
        'a.id AS assistant_id',
        'a.full_name AS assistant_full_name',
      ])
      .orderBy('g.created_at', 'DESC')
      .getRawMany<RawGroupListRow>();

    return rows.map((r) => this.mapRawToGroupListRow(r));
  }

  async findByActiveMemberForList(
    userId: string,
  ): Promise<GroupListRow | null> {
    const row = await this.groupRepo
      .createQueryBuilder('g')
      .innerJoin(
        MembershipTypeOrmEntity,
        'm',
        'm.group_id = g.id AND m.state = :state AND m.user_id = :userId',
        { state: 'Active', userId },
      )
      .leftJoin(UserTypeOrmEntity, 't', 't.id = g.teacher_id')
      .leftJoin(UserTypeOrmEntity, 'a', 'a.id = g.assistant_id')
      .select([
        'g.id AS id',
        'g.name AS name',
        'g.gender AS gender',
        'g.recitation_day AS recitation_day',
        'g.enrollment_status AS enrollment_status',
        'g.lifecycle_state AS lifecycle_state',
        'g.created_at AS created_at',
        't.id AS teacher_id',
        't.full_name AS teacher_full_name',
        'a.id AS assistant_id',
        'a.full_name AS assistant_full_name',
      ])
      .orderBy('g.created_at', 'DESC')
      .getRawOne<RawGroupListRow>();

    if (!row) {
      return null;
    }

    return this.mapRawToGroupListRow(row);
  }

  async findAvailableForGender(
    gender: 'Male' | 'Female',
  ): Promise<GroupListRow[]> {
    const rows = await this.groupRepo
      .createQueryBuilder('g')
      .leftJoin(UserTypeOrmEntity, 't', 't.id = g.teacher_id')
      .leftJoin(UserTypeOrmEntity, 'a', 'a.id = g.assistant_id')
      .where('g.enrollment_status = :status', { status: 'Open' })
      .andWhere('g.lifecycle_state = :state', { state: 'Active' })
      .andWhere('g.gender = :gender', { gender })
      .select([
        'g.id AS id',
        'g.name AS name',
        'g.gender AS gender',
        'g.recitation_day AS recitation_day',
        'g.enrollment_status AS enrollment_status',
        'g.lifecycle_state AS lifecycle_state',
        'g.created_at AS created_at',
        't.id AS teacher_id',
        't.full_name AS teacher_full_name',
        'a.id AS assistant_id',
        'a.full_name AS assistant_full_name',
      ])
      .orderBy('g.created_at', 'DESC')
      .getRawMany<RawGroupListRow>();

    return rows.map((r) => this.mapRawToGroupListRow(r));
  }

  async findGenderByUserId(userId: string): Promise<'Male' | 'Female' | null> {
    const user = await this.groupRepo.manager
      .getRepository(UserTypeOrmEntity)
      .findOne({
        where: { id: userId },
        select: ['gender'],
      });

    return (user?.gender as 'Male' | 'Female') ?? null;
  }

  async findByIdForDetail(groupId: string): Promise<GroupListRow | null> {
    const row = await this.groupRepo
      .createQueryBuilder('g')
      .leftJoin(UserTypeOrmEntity, 't', 't.id = g.teacher_id')
      .leftJoin(UserTypeOrmEntity, 'a', 'a.id = g.assistant_id')
      .where('g.id = :groupId', { groupId })
      .select([
        'g.id AS id',
        'g.name AS name',
        'g.gender AS gender',
        'g.recitation_day AS recitation_day',
        'g.enrollment_status AS enrollment_status',
        'g.lifecycle_state AS lifecycle_state',
        'g.created_at AS created_at',
        't.id AS teacher_id',
        't.full_name AS teacher_full_name',
        'a.id AS assistant_id',
        'a.full_name AS assistant_full_name',
      ])
      .getRawOne<RawGroupListRow>();

    if (!row) {
      return null;
    }

    return this.mapRawToGroupListRow(row);
  }

  async findByActiveMemberAndGroupId(
    userId: string,
    groupId: string,
  ): Promise<GroupListRow | null> {
    const row = await this.groupRepo
      .createQueryBuilder('g')
      .innerJoin(
        MembershipTypeOrmEntity,
        'm',
        'm.group_id = g.id AND m.state = :state AND m.user_id = :userId',
        { state: 'Active', userId },
      )
      .leftJoin(UserTypeOrmEntity, 't', 't.id = g.teacher_id')
      .leftJoin(UserTypeOrmEntity, 'a', 'a.id = g.assistant_id')
      .where('g.id = :groupId', { groupId })
      .select([
        'g.id AS id',
        'g.name AS name',
        'g.gender AS gender',
        'g.recitation_day AS recitation_day',
        'g.enrollment_status AS enrollment_status',
        'g.lifecycle_state AS lifecycle_state',
        'g.created_at AS created_at',
        't.id AS teacher_id',
        't.full_name AS teacher_full_name',
        'a.id AS assistant_id',
        'a.full_name AS assistant_full_name',
      ])
      .getRawOne<RawGroupListRow>();

    if (!row) {
      return null;
    }

    return this.mapRawToGroupListRow(row);
  }

  async findByName(name: string): Promise<GroupListRow | null> {
    const row = await this.groupRepo
      .createQueryBuilder('g')
      .leftJoin(UserTypeOrmEntity, 't', 't.id = g.teacher_id')
      .leftJoin(UserTypeOrmEntity, 'a', 'a.id = g.assistant_id')
      .where('g.name = :name', { name: name.trim() })
      .select([
        'g.id AS id',
        'g.name AS name',
        'g.gender AS gender',
        'g.recitation_day AS recitation_day',
        'g.enrollment_status AS enrollment_status',
        'g.lifecycle_state AS lifecycle_state',
        'g.created_at AS created_at',
        't.id AS teacher_id',
        't.full_name AS teacher_full_name',
        'a.id AS assistant_id',
        'a.full_name AS assistant_full_name',
      ])
      .getRawOne<RawGroupListRow>();

    if (!row) {
      return null;
    }

    return this.mapRawToGroupListRow(row);
  }

  async create(groupData: {
    id: string;
    name: string;
    gender: 'Male' | 'Female';
    recitationDay: number;
    enrollmentStatus?: string;
    lifecycleState?: string;
    teacherId: string;
    assistantId: string;
    createdBy: string;
  }): Promise<GroupListRow> {
    const entity = this.groupRepo.create({
      id: groupData.id,
      name: groupData.name.trim(),
      gender: groupData.gender,
      recitationDay: groupData.recitationDay,
      enrollmentStatus: groupData.enrollmentStatus ?? 'Closed',
      lifecycleState: groupData.lifecycleState ?? 'Active',
      teacherId: groupData.teacherId,
      assistantId: groupData.assistantId,
      createdBy: groupData.createdBy,
    });

    await this.groupRepo.save(entity);
    const created = await this.findByIdForDetail(groupData.id);
    return created!;
  }

  async updateName(id: string, name: string): Promise<GroupListRow | null> {
    const updateResult = await this.groupRepo.update(
      { id },
      { name: name.trim() },
    );

    if (!updateResult.affected || updateResult.affected === 0) {
      return null;
    }

    return this.findByIdForDetail(id);
  }

  /** Guarded by `lifecycle_state = 'Active'` — see the interface (BR-42, TS §20). */
  async updateEnrollmentStatus(
    id: string,
    status: 'Open' | 'Closed',
  ): Promise<GroupListRow | null> {
    const updateResult = await this.groupRepo.update(
      { id, lifecycleState: 'Active' },
      { enrollmentStatus: status },
    );

    if (!updateResult.affected || updateResult.affected === 0) {
      return null;
    }

    return this.findByIdForDetail(id);
  }

  async updateStaff(
    id: string,
    fields: { teacherId?: string; assistantId?: string },
  ): Promise<GroupListRow | null> {
    const updateFields: { teacherId?: string; assistantId?: string } = {};
    if (fields.teacherId !== undefined) {
      updateFields.teacherId = fields.teacherId;
    }
    if (fields.assistantId !== undefined) {
      updateFields.assistantId = fields.assistantId;
    }

    if (Object.keys(updateFields).length === 0) {
      return this.findByIdForDetail(id);
    }

    const updateResult = await this.groupRepo.update({ id }, updateFields);

    if (!updateResult.affected || updateResult.affected === 0) {
      return null;
    }

    return this.findByIdForDetail(id);
  }

  /**
   * The un-archive half of UC-13, guarded the same way its archival twin is.
   *
   * The `lifecycle_state = 'Archived'` predicate matters more here than it
   * looks: an un-archive that read `Archived` a moment before a concurrent
   * archive committed would otherwise clobber it, leaving the group `Active`
   * with `archived_at` cleared **after** that archive's cascade had already
   * auto-rejected its whole Pending queue (FR-REQ-08) — and nothing in the API
   * revives a rejected request (APIS §10.4). 0 rows means the group was
   * already `Active`; that is BR-42's no-op, not an error.
   */
  async unarchive(groupId: string): Promise<GroupLifecycleTransition> {
    const changedRows = unwrapReturning<{ id: string }>(
      await this.groupRepo.query(
        `UPDATE groups
            SET lifecycle_state = 'Active',
                archived_at = NULL,
                updated_at = now()
          WHERE id = $1 AND lifecycle_state = 'Archived'
          RETURNING id`,
        [groupId],
      ),
    );

    return {
      changed: changedRows.length > 0,
      group: await this.findByIdForDetail(groupId),
    };
  }

  /**
   * DS-07's archival transaction (UC-13 / FR-REQ-08 / BR-42).
   *
   * Two statements, one transaction (AR-04), default `READ COMMITTED` — no row
   * locking and no elevated isolation, per TS §20:
   *
   *  1. A **guarded** `UPDATE … WHERE lifecycle_state = 'Active'` decides who
   *     archives. Two concurrent Admins cannot both cascade: the loser matches
   *     0 rows and returns `archived: false`, BR-42's no-op.
   *  2. The bulk auto-reject. It takes a write lock on every `Pending` row of
   *     the group, so a concurrent accept's own
   *     `UPDATE … WHERE status = 'Pending'` either ran first (and wins, the
   *     legitimate serial order) or blocks here, re-reads `Rejected` after this
   *     commit, matches 0 rows and answers `409 ALREADY_DECIDED`.
   *
   * `resolution_source = 'system'` marks the archival auto-rejection apart from
   * an Assistant's `'manual'` decision (SAS §21.3, DBD §14). Only columns
   * DB-CHK-10 permits are touched; `reviewed_by` stays NULL because no human
   * reviewed it.
   */
  async archiveWithPendingRejection(
    groupId: string,
    archivedAt: Date,
  ): Promise<GroupArchivalResult> {
    const outcome = await this.groupRepo.manager.transaction(
      async (manager) => {
        const archivedRows = unwrapReturning<{ id: string }>(
          await manager.query(
            `UPDATE groups
                SET lifecycle_state = 'Archived',
                    archived_at = $2,
                    updated_at = now()
              WHERE id = $1 AND lifecycle_state = 'Active'
              RETURNING id`,
            [groupId, archivedAt],
          ),
        );

        if (archivedRows.length === 0) {
          return { changed: false, autoRejectedRequestIds: [] as string[] };
        }

        const rejectedRows = unwrapReturning<{ id: string }>(
          await manager.query(
            `UPDATE join_requests
                SET status = 'Rejected',
                    reviewed_at = $2,
                    resolution_source = 'system'
              WHERE group_id = $1
                AND status = 'Pending'
                AND deleted_at IS NULL
              RETURNING id`,
            [groupId, archivedAt],
          ),
        );

        return {
          changed: true,
          autoRejectedRequestIds: rejectedRows.map((r) => r.id),
        };
      },
    );

    return { ...outcome, group: await this.findByIdForDetail(groupId) };
  }

  async hasMembershipHistory(groupId: string): Promise<boolean> {
    const count = await this.groupRepo.manager
      .getRepository(MembershipTypeOrmEntity)
      .count({
        where: { groupId },
      });

    return count > 0;
  }

  async hasActiveMembership(userId: string): Promise<boolean> {
    const count = await this.groupRepo.manager
      .getRepository(MembershipTypeOrmEntity)
      .count({
        where: { userId, state: 'Active' },
      });

    return count > 0;
  }

  async deleteById(groupId: string): Promise<boolean> {
    return this.groupRepo.manager.transaction(async (manager) => {
      await manager.query('DELETE FROM join_requests WHERE group_id = $1', [
        groupId,
      ]);

      const deleteResult = await manager.delete(GroupTypeOrmEntity, {
        id: groupId,
      });

      return (deleteResult.affected ?? 0) > 0;
    });
  }

  private mapRawToGroupListRow(raw: RawGroupListRow): GroupListRow {
    return {
      id: raw.id,
      name: raw.name,
      gender: raw.gender,
      recitation_day: Number(raw.recitation_day),
      enrollment_status: raw.enrollment_status,
      lifecycle_state: raw.lifecycle_state,
      created_at: new Date(raw.created_at),
      teacher: {
        id: raw.teacher_id,
        full_name: raw.teacher_full_name ?? null,
      },
      assistant: {
        id: raw.assistant_id,
        full_name: raw.assistant_full_name ?? null,
      },
    };
  }
}

/**
 * `EntityManager.query` surfaces an `UPDATE … RETURNING` result either as the
 * row array itself or as the driver's `[rows, affectedCount]` pair, depending on
 * the call path. The enrollment repository's conditional updates normalise it
 * the same way; this keeps the shape decision in one expression instead of
 * scattering unchecked member access through the query sites.
 */
function unwrapReturning<T>(result: unknown): T[] {
  if (!Array.isArray(result)) {
    return [];
  }
  if (Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return result as T[];
}
