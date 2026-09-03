import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JOIN_REQUEST_REPOSITORY } from '../../domain/join-request.repository.interface';
import type { IJoinRequestRepository } from '../../domain/join-request.repository.interface';
import { JoinRequestRejectedEvent } from '../../domain/events/join-request-rejected.event';
import { RejectJoinRequestResponseDto } from './reject-join-request-response.dto';

@Injectable()
export class RejectJoinRequestUseCase {
  constructor(
    @Inject(JOIN_REQUEST_REPOSITORY)
    private readonly joinRequestRepo: IJoinRequestRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    actorId: string,
    joinRequestId: string,
  ): Promise<RejectJoinRequestResponseDto> {
    // 1. Uniform 403 scope check (NFR-20 / APIQ-04). As in API-023: the
    //    assigned Assistant is the only decider (APIS §6.1's `accept|reject`
    //    row, SRS §10's "Assistant: R A (own groups)"), so no Admin bypass.
    const row = await this.joinRequestRepo.findByIdForDetail(joinRequestId);
    if (!row || row.deletedAt) {
      throw new ForbiddenException();
    }

    if (row.assistantId !== actorId) {
      throw new ForbiddenException();
    }

    // 2. Conditional update (0-row guard for 409 ALREADY_DECIDED)
    const rejectedRow = await this.joinRequestRepo.rejectConditionally(
      joinRequestId,
      actorId,
    );

    if (!rejectedRow) {
      throw new ConflictException({
        statusCode: 409,
        error: 'ALREADY_DECIDED',
        message: 'تم اتخاذ قرار بشأن هذا الطلب مسبقاً',
      });
    }

    // 3. Fire-and-forget domain event (N-04 / UC-04)
    try {
      this.eventEmitter.emit(
        JoinRequestRejectedEvent.EVENT_NAME,
        new JoinRequestRejectedEvent(joinRequestId, rejectedRow.userId),
      );
    } catch {
      // Best-effort event emission must never block response
    }

    // 4. Return API contract response
    return {
      data: {
        status: 'Rejected',
      },
    };
  }
}
