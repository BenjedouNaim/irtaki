import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  GROUP_REPOSITORY,
  type IGroupRepository,
} from '../../../groups/domain/group.repository.interface';
import {
  MEMBERSHIP_REPOSITORY,
  type IMembershipRepository,
  type RosterRow,
} from '../../domain/membership.repository.interface';
import {
  GetRosterResponseDto,
  RosterEntryDto,
} from './get-roster-response.dto';

@Injectable()
export class GetRosterUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: IMembershipRepository,
  ) {}

  async execute(
    callerId: string,
    callerRole: UserRole,
    groupId: string,
    asOf?: string,
  ): Promise<GetRosterResponseDto> {
    if (callerRole === UserRole.Teacher || callerRole === UserRole.Assistant) {
      const assigned =
        await this.groupRepository.findByStaffIdForList(callerId);
      if (!assigned.some((row) => row.id === groupId)) {
        throw new ForbiddenException();
      }
    } else if (callerRole === UserRole.Admin) {
      const group = await this.groupRepository.findByIdForDetail(groupId);
      if (!group) {
        throw new ForbiddenException();
      }
    } else {
      throw new ForbiddenException();
    }

    const rows = await this.membershipRepository.findRosterByGroupId(groupId, {
      asOf,
    });

    return {
      data: rows.map((row) => this.mapToEntryDto(row)),
    };
  }

  private mapToEntryDto(row: RosterRow): RosterEntryDto {
    return {
      id: row.id,
      user: {
        id: row.userId,
        full_name: row.fullName,
        gender: row.gender,
      },
      started_at: row.startedAt,
      state: row.state,
    };
  }
}
