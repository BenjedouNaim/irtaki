import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MEMBERSHIP_REPOSITORY } from '../../domain/membership.repository.interface';
import type { IMembershipRepository } from '../../domain/membership.repository.interface';
import { OwnMembershipResponseDto } from './get-own-membership-response.dto';

@Injectable()
export class GetOwnMembershipUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: IMembershipRepository,
  ) {}

  async execute(userId: string): Promise<OwnMembershipResponseDto> {
    const membership =
      await this.membershipRepository.findActiveByUserId(userId);

    if (!membership) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    return {
      data: {
        id: membership.id,
        group: {
          id: membership.group.id,
          name: membership.group.name,
          recitation_day: membership.group.recitationDay,
          enrollment_status: membership.group.enrollmentStatus,
        },
        started_at: membership.startedAt,
        state: membership.state,
      },
    };
  }
}
