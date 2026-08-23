import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { USER_REPOSITORY } from '../../../identity/domain/user.repository.interface';
import type { IUserRepository } from '../../../identity/domain/user.repository.interface';
import { MEMBERSHIP_REPOSITORY } from '../../../memberships/domain/membership.repository.interface';
import type { IMembershipRepository } from '../../../memberships/domain/membership.repository.interface';
import { COVERAGE_REPOSITORY } from '../../../progress/domain/coverage.repository.interface';
import type { ICoverageRepository } from '../../../progress/domain/coverage.repository.interface';
import { JOIN_REQUEST_REPOSITORY } from '../../domain/join-request.repository.interface';
import type { IJoinRequestRepository } from '../../domain/join-request.repository.interface';
import { JoinRequestAcceptedEvent } from '../../domain/events/join-request-accepted.event';
import { AcceptJoinRequestResponseDto } from './accept-join-request-response.dto';

@Injectable()
export class AcceptJoinRequestUseCase {
  constructor(
    @Inject(JOIN_REQUEST_REPOSITORY)
    private readonly joinRequestRepo: IJoinRequestRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(COVERAGE_REPOSITORY)
    private readonly coverageRepo: ICoverageRepository,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    actorId: string,
    actorRole: string,
    joinRequestId: string,
  ): Promise<AcceptJoinRequestResponseDto> {
    // 1. Uniform 403 scope check (NFR-20 / APIQ-04)
    const row = await this.joinRequestRepo.findByIdForDetail(joinRequestId);
    if (!row || row.deletedAt) {
      throw new ForbiddenException();
    }

    const isAdmin = actorRole === (UserRole.Admin as string);
    if (!isAdmin && row.assistantId !== actorId) {
      throw new ForbiddenException();
    }

    // 2. Atomic transaction (DS-01 / AR-04)
    const result = await this.dataSource.transaction(async (manager) => {
      // 2a. Conditional update (0-row guard for 409 ALREADY_DECIDED)
      const acceptedRow = await this.joinRequestRepo.acceptConditionally(
        joinRequestId,
        actorId,
        manager,
      );

      if (!acceptedRow) {
        throw new ConflictException({
          statusCode: 409,
          error: 'ALREADY_DECIDED',
          message: 'تم اتخاذ قرار بشأن هذا الطلب مسبقاً',
        });
      }

      // 2b. Membership creation with unique index constraint mapping (DB-UQ-02 / DB-UQ-09)
      let membership: { id: string; startedAt: string };
      try {
        const today = new Date().toISOString().split('T')[0];
        membership = await this.membershipRepo.create(
          {
            userId: acceptedRow.userId,
            groupId: acceptedRow.groupId,
            joinRequestId,
            startedAt: today,
          },
          manager,
        );
      } catch (err: unknown) {
        const errorObj = err as {
          code?: string;
          driverError?: { code?: string };
          detail?: string;
        };
        if (
          errorObj?.code === '23505' ||
          errorObj?.driverError?.code === '23505' ||
          (typeof errorObj?.detail === 'string' &&
            (errorObj.detail.includes('DB-UQ-02') ||
              errorObj.detail.includes('DB-UQ-09')))
        ) {
          throw new ConflictException({
            statusCode: 409,
            error: 'APPLICANT_NO_LONGER_ELIGIBLE',
            message: 'المتقدم مسجل بالفعل في حلقة نشطة أخرى',
          });
        }
        throw err;
      }

      // 2c. Role promotion to Student and profile data sync
      await this.userRepo.promoteToStudent(
        acceptedRow.userId,
        acceptedRow.fullName,
        acceptedRow.gender,
        manager,
      );

      // 2d. Memorization coverage and intervals seed
      await this.coverageRepo.seedFromHizbSelection(
        membership.id,
        acceptedRow.memorizedAhzab,
        manager,
      );

      return {
        membershipId: membership.id,
        applicantUserId: acceptedRow.userId,
      };
    });

    // 3. Fire-and-forget domain event (DE-02)
    try {
      this.eventEmitter.emit(
        JoinRequestAcceptedEvent.EVENT_NAME,
        new JoinRequestAcceptedEvent(
          joinRequestId,
          result.membershipId,
          result.applicantUserId,
        ),
      );
    } catch {
      // Best-effort event emission must never block response
    }

    // 4. Return API contract response
    return {
      data: {
        membership_id: result.membershipId,
      },
    };
  }
}
