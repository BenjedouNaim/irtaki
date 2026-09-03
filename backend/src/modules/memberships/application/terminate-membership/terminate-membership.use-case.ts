import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { USER_REPOSITORY } from '../../../identity/domain/user.repository.interface';
import type { IUserRepository } from '../../../identity/domain/user.repository.interface';
import { MEMBERSHIP_REPOSITORY } from '../../domain/membership.repository.interface';
import type { IMembershipRepository } from '../../domain/membership.repository.interface';
import { localDateInTimezone } from '../../../reports/domain/local-date';
import { MembershipTerminatedEvent } from '../../domain/events/membership-terminated.event';
import { TerminateMembershipResponseDto } from './terminate-membership-response.dto';

const MEMBERSHIP_ID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TerminateMembershipUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    callerId: string,
    membershipId: string,
  ): Promise<TerminateMembershipResponseDto> {
    if (!MEMBERSHIP_ID_SHAPE.test(membershipId)) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    // Hoisted so DE-09 carries the same date that was written (INV-27).
    let endedAt = '';

    await this.dataSource.transaction(async (manager) => {
      const row = await this.membershipRepository.findStateAndUserById(
        membershipId,
        manager,
      );
      if (!row) {
        throw new NotFoundException({
          statusCode: 404,
          error: 'NOT_FOUND',
          message: 'المورد المطلوب غير موجود',
        });
      }
      if (row.userId === callerId) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'CANNOT_REMOVE_SELF',
          message: 'لا يمكنك إزالة عضويتك الخاصة',
        });
      }
      if (row.state !== 'Active') {
        throw new ConflictException({
          statusCode: 409,
          error: 'ALREADY_TERMINATED',
          message: 'تم إنهاء هذه العضوية مسبقاً',
        });
      }

      // `ended_at` is a calendar date (DBD `DATE`) and bounds every
      // downstream EffectiveWindow, so it is dated in the removed member's
      // own timezone, never the server's (INV-27 / T-01).
      endedAt = localDateInTimezone(new Date(), row.timezone);

      const terminated = await this.membershipRepository.terminateConditionally(
        membershipId,
        callerId,
        endedAt,
        manager,
      );
      if (!terminated) {
        throw new ConflictException({
          statusCode: 409,
          error: 'ALREADY_TERMINATED',
          message: 'تم إنهاء هذه العضوية مسبقاً',
        });
      }

      await this.membershipRepository.softDeleteMembershipRecords(
        membershipId,
        terminated.joinRequestId,
        manager,
      );
      await this.userRepository.demoteToUser(terminated.userId, manager);
    });

    const response: TerminateMembershipResponseDto = {
      data: { membership_id: membershipId, state: 'Terminated' },
    };

    try {
      this.eventEmitter.emit(
        MembershipTerminatedEvent.EVENT_NAME,
        new MembershipTerminatedEvent(membershipId, callerId, endedAt),
      );
    } catch {
      return response;
    }

    return response;
  }
}
