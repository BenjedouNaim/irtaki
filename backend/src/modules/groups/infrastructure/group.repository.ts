import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
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
