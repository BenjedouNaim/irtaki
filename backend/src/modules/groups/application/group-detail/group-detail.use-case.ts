import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  GROUP_REPOSITORY,
  type IGroupRepository,
  type GroupListRow,
} from '../../domain/group.repository.interface';
import {
  GroupListItemDto,
  GroupListItemLimitedDto,
} from '../list-groups/group-list-item.dto';
import { GroupDetailResponseDto } from './group-detail.dto';

@Injectable()
export class GroupDetailUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
  ) {}

  async execute(
    userId: string,
    role: UserRole,
    groupId: string,
  ): Promise<GroupDetailResponseDto> {
    switch (role) {
      case UserRole.Admin: {
        const row = await this.groupRepository.findByIdForDetail(groupId);
        if (!row) {
          throw new ForbiddenException();
        }
        return {
          data: this.mapToFullDto(row),
        };
      }

      case UserRole.Teacher:
      case UserRole.Assistant: {
        const rows = await this.groupRepository.findByStaffIdForList(userId);
        const row = rows.find((r) => r.id === groupId);
        if (!row) {
          throw new ForbiddenException();
        }
        return {
          data: this.mapToFullDto(row),
        };
      }

      case UserRole.Student: {
        const row = await this.groupRepository.findByActiveMemberAndGroupId(
          userId,
          groupId,
        );
        if (!row) {
          throw new ForbiddenException();
        }
        return {
          data: this.mapToLimitedDto(row),
        };
      }

      case UserRole.User:
      default:
        throw new ForbiddenException();
    }
  }

  private mapToFullDto(row: GroupListRow): GroupListItemDto {
    return {
      id: row.id,
      name: row.name,
      gender: row.gender,
      recitation_day: row.recitation_day,
      enrollment_status: row.enrollment_status,
      lifecycle_state: row.lifecycle_state,
      teacher: {
        id: row.teacher.id,
        full_name: row.teacher.full_name,
      },
      assistant: {
        id: row.assistant.id,
        full_name: row.assistant.full_name,
      },
    };
  }

  private mapToLimitedDto(row: GroupListRow): GroupListItemLimitedDto {
    return {
      id: row.id,
      name: row.name,
      recitation_day: row.recitation_day,
      enrollment_status: row.enrollment_status,
    };
  }
}
