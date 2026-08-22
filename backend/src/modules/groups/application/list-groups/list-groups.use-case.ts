import { Inject, Injectable } from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  GROUP_REPOSITORY,
  type IGroupRepository,
  type GroupListRow,
} from '../../domain/group.repository.interface';
import {
  GroupListItemDto,
  GroupListItemLimitedDto,
  ListGroupsResponseDto,
} from './group-list-item.dto';

@Injectable()
export class ListGroupsUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
  ) {}

  async execute(
    userId: string,
    role: UserRole,
  ): Promise<ListGroupsResponseDto> {
    switch (role) {
      case UserRole.Admin: {
        const rows = await this.groupRepository.findAllForList();
        return {
          data: rows.map((r) => this.mapToFullDto(r)),
        };
      }

      case UserRole.Teacher:
      case UserRole.Assistant: {
        const rows = await this.groupRepository.findByStaffIdForList(userId);
        return {
          data: rows.map((r) => this.mapToFullDto(r)),
        };
      }

      case UserRole.Student: {
        const row =
          await this.groupRepository.findByActiveMemberForList(userId);
        if (!row) {
          return { data: [] };
        }
        return {
          data: [this.mapToLimitedDto(row)],
        };
      }

      case UserRole.User:
      default:
        return { data: [] };
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
