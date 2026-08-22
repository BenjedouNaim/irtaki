import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  GROUP_REPOSITORY,
  type IGroupRepository,
  type GroupListRow,
} from '../../domain/group.repository.interface';
import {
  GroupListItemLimitedDto,
  ListGroupsResponseDto,
} from '../list-groups/group-list-item.dto';

@Injectable()
export class BrowseAvailableGroupsUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
  ) {}

  async execute(
    userId: string,
    role: UserRole,
    queryGender?: string,
  ): Promise<ListGroupsResponseDto> {
    if (role === UserRole.User) {
      if (
        !queryGender ||
        (queryGender !== 'Male' && queryGender !== 'Female')
      ) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'GENDER_REQUIRED',
          message: 'يرجى تحديد الجنس لعرض الحلقات المتاحة',
        });
      }

      const rows =
        await this.groupRepository.findAvailableForGender(queryGender);
      return {
        data: rows.map((r) => this.mapToLimitedDto(r)),
      };
    }

    const storedGender = await this.groupRepository.findGenderByUserId(userId);
    if (!storedGender) {
      return { data: [] };
    }

    const rows =
      await this.groupRepository.findAvailableForGender(storedGender);
    return {
      data: rows.map((r) => this.mapToLimitedDto(r)),
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
