import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  IJoinRequestRepository,
  JoinRequestAcceptRow,
  JoinRequestDetailRow,
  JoinRequestQueueRow,
  JoinRequestRecord,
} from '../domain/join-request.repository.interface';
import { JoinRequest } from '../domain/join-request.entity';
import { JoinRequestTypeOrmEntity } from './join-request.typeorm-entity';
import { JoinRequestAhzabTypeOrmEntity } from './join-request-ahzab.typeorm-entity';

@Injectable()
export class JoinRequestRepository implements IJoinRequestRepository {
  constructor(
    @InjectRepository(JoinRequestTypeOrmEntity)
    private readonly joinRequestRepo: Repository<JoinRequestTypeOrmEntity>,
  ) {}

  async findByIdForDetail(id: string): Promise<JoinRequestDetailRow | null> {
    const rawRow = await this.joinRequestRepo
      .createQueryBuilder('jr')
      .innerJoin('groups', 'g', 'g.id = jr.group_id')
      .where('jr.id = :id', { id })
      .andWhere('jr.deleted_at IS NULL')
      .select([
        'jr.id AS id',
        'jr.user_id AS user_id',
        'jr.group_id AS group_id',
        'jr.full_name AS full_name',
        'jr.gender AS gender',
        'jr.age AS age',
        'jr.phone_number AS phone_number',
        'jr.occupation AS occupation',
        'jr.city AS city',
        'jr.memorized_hizb_count AS memorized_hizb_count',
        'jr.tajweed_level AS tajweed_level',
        'jr.studied_tajweed_theory AS studied_tajweed_theory',
        'jr.studied_qalun AS studied_qalun',
        'jr.fee_agreement AS fee_agreement',
        'jr.program_goal AS program_goal',
        'jr.score AS score',
        'jr.status AS status',
        'jr.resolution_source AS resolution_source',
        'jr.reviewed_at AS reviewed_at',
        'jr.reviewed_by AS reviewed_by',
        'jr.created_at AS created_at',
        'jr.deleted_at AS deleted_at',
        'g.assistant_id AS assistant_id',
      ])
      .getRawOne<{
        id: string;
        user_id: string;
        group_id: string;
        full_name: string;
        gender: string;
        age: number | string;
        phone_number: string;
        occupation: string;
        city: string;
        memorized_hizb_count: number | string;
        tajweed_level: string;
        studied_tajweed_theory: boolean;
        studied_qalun: boolean;
        fee_agreement: boolean;
        program_goal: string;
        score: number | string;
        status: string;
        resolution_source: string | null;
        reviewed_at: Date | string | null;
        reviewed_by: string | null;
        created_at: Date | string;
        deleted_at: Date | string | null;
        assistant_id: string;
      }>();

    if (!rawRow) {
      return null;
    }

    const ahzabRows = await this.joinRequestRepo.manager.find(
      JoinRequestAhzabTypeOrmEntity,
      {
        where: { joinRequestId: id },
        order: { hizbNumber: 'ASC' },
      },
    );

    return {
      id: rawRow.id,
      userId: rawRow.user_id,
      groupId: rawRow.group_id,
      fullName: rawRow.full_name,
      gender: rawRow.gender,
      age: Number(rawRow.age),
      phoneNumber: rawRow.phone_number,
      occupation: rawRow.occupation,
      city: rawRow.city,
      memorizedHizbCount: Number(rawRow.memorized_hizb_count),
      tajweedLevel: rawRow.tajweed_level,
      studiedTajweedTheory: Boolean(rawRow.studied_tajweed_theory),
      studiedQalun: Boolean(rawRow.studied_qalun),
      feeAgreement: Boolean(rawRow.fee_agreement),
      programGoal: rawRow.program_goal,
      score: Number(rawRow.score),
      status: rawRow.status,
      resolutionSource: rawRow.resolution_source,
      reviewedAt: rawRow.reviewed_at ? new Date(rawRow.reviewed_at) : null,
      reviewedBy: rawRow.reviewed_by,
      createdAt: new Date(rawRow.created_at),
      deletedAt: rawRow.deleted_at ? new Date(rawRow.deleted_at) : null,
      assistantId: rawRow.assistant_id,
      memorizedAhzab: ahzabRows.map((a) => Number(a.hizbNumber)),
    };
  }

  async create(joinRequest: JoinRequest): Promise<JoinRequestRecord> {
    return this.joinRequestRepo.manager.transaction(async (manager) => {
      // 1. Insert parent join_request
      const entity = manager.create(JoinRequestTypeOrmEntity, {
        id: joinRequest.id,
        userId: joinRequest.userId,
        groupId: joinRequest.groupId,
        fullName: joinRequest.fullName,
        gender: joinRequest.gender,
        age: joinRequest.age,
        phoneNumber: joinRequest.phoneNumber,
        occupation: joinRequest.occupation,
        city: joinRequest.city,
        memorizedHizbCount: joinRequest.memorizedHizbCount,
        tajweedLevel: joinRequest.tajweedLevel,
        studiedTajweedTheory: joinRequest.studiedTajweedTheory,
        studiedQalun: joinRequest.studiedQalun,
        feeAgreement: joinRequest.feeAgreement,
        programGoal: joinRequest.programGoal,
        score: joinRequest.score,
        status: joinRequest.status,
        resolutionSource: joinRequest.resolutionSource,
        reviewedAt: joinRequest.reviewedAt,
        reviewedBy: joinRequest.reviewedBy,
        createdAt: joinRequest.createdAt,
        deletedAt: joinRequest.deletedAt,
      });

      const saved = await manager.save(JoinRequestTypeOrmEntity, entity);

      // 2. Insert ahzab child rows
      if (joinRequest.memorizedAhzab.length > 0) {
        const ahzabEntities = joinRequest.memorizedAhzab.map((hizbNumber) =>
          manager.create(JoinRequestAhzabTypeOrmEntity, {
            joinRequestId: joinRequest.id,
            hizbNumber,
          }),
        );
        await manager.save(JoinRequestAhzabTypeOrmEntity, ahzabEntities);
      }

      return {
        id: saved.id,
        userId: saved.userId,
        groupId: saved.groupId,
        fullName: saved.fullName,
        gender: saved.gender,
        age: saved.age,
        phoneNumber: saved.phoneNumber,
        occupation: saved.occupation,
        city: saved.city,
        memorizedHizbCount: saved.memorizedHizbCount,
        tajweedLevel: saved.tajweedLevel,
        studiedTajweedTheory: saved.studiedTajweedTheory,
        studiedQalun: saved.studiedQalun,
        feeAgreement: saved.feeAgreement,
        programGoal: saved.programGoal,
        score: Number(saved.score),
        status: saved.status,
        resolutionSource: saved.resolutionSource,
        reviewedAt: saved.reviewedAt,
        reviewedBy: saved.reviewedBy,
        createdAt: saved.createdAt,
        deletedAt: saved.deletedAt,
      };
    });
  }

  async existsPendingForUser(userId: string): Promise<boolean> {
    const count = await this.joinRequestRepo.count({
      where: {
        userId,
        status: 'Pending',
      },
    });
    return count > 0;
  }

  async findLatestForUser(userId: string): Promise<JoinRequestRecord | null> {
    const record = await this.joinRequestRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      userId: record.userId,
      groupId: record.groupId,
      fullName: record.fullName,
      gender: record.gender,
      age: record.age,
      phoneNumber: record.phoneNumber,
      occupation: record.occupation,
      city: record.city,
      memorizedHizbCount: record.memorizedHizbCount,
      tajweedLevel: record.tajweedLevel,
      studiedTajweedTheory: record.studiedTajweedTheory,
      studiedQalun: record.studiedQalun,
      feeAgreement: record.feeAgreement,
      programGoal: record.programGoal,
      score: Number(record.score),
      status: record.status,
      resolutionSource: record.resolutionSource,
      reviewedAt: record.reviewedAt,
      reviewedBy: record.reviewedBy,
      createdAt: record.createdAt,
      deletedAt: record.deletedAt,
    };
  }

  async findPendingQueue(params: {
    assistantId: string | null;
    limit: number;
    cursor: {
      id: string;
      sortKey: { score: number; createdAt: string };
    } | null;
  }): Promise<{ rows: JoinRequestQueueRow[]; hasMore: boolean }> {
    const qb = this.joinRequestRepo
      .createQueryBuilder('jr')
      .where('jr.status = :status', { status: 'Pending' })
      .andWhere('jr.deleted_at IS NULL');

    if (params.assistantId !== null) {
      qb.andWhere(
        'jr.group_id IN (SELECT g.id FROM groups g WHERE g.assistant_id = :assistantId)',
        { assistantId: params.assistantId },
      );
    }

    if (params.cursor) {
      const cursorScore = params.cursor.sortKey.score;
      const cursorCreatedAt = params.cursor.sortKey.createdAt;
      const cursorId = params.cursor.id;

      qb.andWhere(
        `(
          jr.score < :cursorScore
          OR (jr.score = :cursorScore AND jr.created_at > :cursorCreatedAt)
          OR (jr.score = :cursorScore AND jr.created_at = :cursorCreatedAt AND jr.id > :cursorId)
        )`,
        { cursorScore, cursorCreatedAt, cursorId },
      );
    }

    qb.select([
      'jr.id AS id',
      'jr.full_name AS full_name',
      'jr.score AS score',
      'jr.created_at AS created_at',
    ])
      .orderBy('jr.score', 'DESC')
      .addOrderBy('jr.created_at', 'ASC')
      .addOrderBy('jr.id', 'ASC')
      .limit(params.limit + 1);

    const rawRows = await qb.getRawMany<{
      id: string;
      full_name: string;
      score: string | number;
      created_at: Date | string;
    }>();

    const hasMore = rawRows.length > params.limit;
    const selectedRows = hasMore ? rawRows.slice(0, params.limit) : rawRows;

    const rows: JoinRequestQueueRow[] = selectedRows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      score: Number(r.score),
      createdAt: new Date(r.created_at),
    }));

    return { rows, hasMore };
  }

  async acceptConditionally(
    id: string,
    reviewerId: string,
    manager: EntityManager,
  ): Promise<JoinRequestAcceptRow | null> {
    const updateResult: unknown = await manager.query(
      `UPDATE join_requests
       SET status = 'Accepted',
           reviewed_at = now(),
           reviewed_by = $2,
           resolution_source = 'manual'
       WHERE id = $1 AND status = 'Pending' AND deleted_at IS NULL
       RETURNING user_id, group_id, full_name, gender`,
      [id, reviewerId],
    );

    const rows = (
      Array.isArray(updateResult) && Array.isArray(updateResult[0])
        ? updateResult[0]
        : Array.isArray(updateResult)
          ? updateResult
          : []
    ) as Array<{
      user_id: string;
      group_id: string;
      full_name: string;
      gender: 'Male' | 'Female';
    }>;

    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];

    const ahzabRows = await manager.find(JoinRequestAhzabTypeOrmEntity, {
      where: { joinRequestId: id },
      order: { hizbNumber: 'ASC' },
    });

    return {
      userId: row.user_id,
      groupId: row.group_id,
      fullName: row.full_name,
      gender: row.gender,
      memorizedAhzab: ahzabRows.map((a) => Number(a.hizbNumber)),
    };
  }
}
