import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IJoinRequestRepository,
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
}
