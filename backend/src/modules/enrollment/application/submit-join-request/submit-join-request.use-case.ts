import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  GROUP_REPOSITORY,
  IGroupRepository,
} from '../../../groups/domain/group.repository.interface';
import {
  IJoinRequestRepository,
  JOIN_REQUEST_REPOSITORY,
} from '../../domain/join-request.repository.interface';
import { JoinRequest } from '../../domain/join-request.entity';
import { JoinRequestValidationError } from '../../domain/join-request.errors';
import { JoinRequestSubmittedEvent } from '../../domain/events/join-request-submitted.event';
import { SubmitJoinRequestDto } from './submit-join-request.dto';
import { SubmitJoinRequestResponseDto } from './submit-join-request-response.dto';

@Injectable()
export class SubmitJoinRequestUseCase {
  constructor(
    @Inject(JOIN_REQUEST_REPOSITORY)
    private readonly joinRequestRepository: IJoinRequestRepository,
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    actorId: string,
    dto: SubmitJoinRequestDto,
  ): Promise<SubmitJoinRequestResponseDto> {
    // 1. Group availability check (VR-34, EC-09, NFR-19/20)
    const group = await this.groupRepository.findByIdForDetail(dto.group_id);
    if (
      !group ||
      group.enrollment_status !== 'Open' ||
      group.lifecycle_state !== 'Active'
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'GROUP_UNAVAILABLE',
        message: 'الحلقة غير متاحة للتسجيل حالياً',
      });
    }

    // 2. Fast-path eligibility checks (VR-09)
    const hasPending =
      await this.joinRequestRepository.existsPendingForUser(actorId);
    if (hasPending) {
      throw new ConflictException({
        statusCode: 409,
        error: 'DUPLICATE_JOIN_REQUEST',
        message: 'لديك طلب انضمام قيد المراجعة بالفعل',
      });
    }

    const hasActiveMembership =
      await this.groupRepository.hasActiveMembership(actorId);
    if (hasActiveMembership) {
      throw new ConflictException({
        statusCode: 409,
        error: 'DUPLICATE_JOIN_REQUEST',
        message: 'أنت مسجل بالفعل كطالب في حلقة نشطة',
      });
    }

    // 3. Domain entity construction & business invariant validation (VR-04a, VR-06, VR-07, VR-08)
    let joinRequest: JoinRequest;
    try {
      joinRequest = JoinRequest.submit({
        userId: actorId,
        groupId: dto.group_id,
        groupGender: group.gender as 'Male' | 'Female',
        fullName: dto.full_name,
        gender: dto.gender,
        age: dto.age,
        phoneNumber: dto.phone_number,
        occupation: dto.occupation,
        city: dto.city,
        memorizedAhzab: dto.memorized_ahzab,
        tajweedLevel: dto.tajweed_level,
        studiedTajweedTheory: dto.studied_tajweed_theory,
        studiedQalun: dto.studied_qalun,
        feeAgreement: dto.fee_agreement,
        programGoal: dto.program_goal,
      });
    } catch (err: unknown) {
      if (err instanceof JoinRequestValidationError) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: err.message,
          details: err.details,
        });
      }
      throw err;
    }

    // 4. Persistence with concurrency guard mapping (DB-UQ-03)
    let record;
    try {
      record = await this.joinRequestRepository.create(joinRequest);
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
          errorObj.detail.includes('DB-UQ-03'))
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'DUPLICATE_JOIN_REQUEST',
          message: 'لديك طلب انضمام قيد المراجعة بالفعل',
        });
      }
      throw err;
    }

    // 5. Fire-and-forget domain event (DE-01) for future Notification listeners
    try {
      this.eventEmitter.emit(
        JoinRequestSubmittedEvent.EVENT_NAME,
        new JoinRequestSubmittedEvent(
          record.id,
          record.groupId,
          record.userId,
          record.score,
          record.createdAt,
        ),
      );
    } catch {
      // Event emission failure must never block the operation
    }

    // 6. Return response envelope
    return {
      data: {
        id: record.id,
        status: record.status,
        score: record.score,
        created_at: record.createdAt,
      },
    };
  }
}
