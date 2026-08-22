import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GROUP_REPOSITORY,
  GroupListRow,
} from '../../domain/group.repository.interface';
import type { IGroupRepository } from '../../domain/group.repository.interface';
import { UpdateGroupNameDto } from './update-group-name.dto';
import { UpdateGroupNameResponseDto } from './update-group-name-response.dto';

@Injectable()
export class UpdateGroupNameUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
  ) {}

  async execute(
    _actorId: string,
    groupId: string,
    dto: UpdateGroupNameDto,
  ): Promise<UpdateGroupNameResponseDto> {
    // 1. Check if group exists
    const existing = await this.groupRepository.findByIdForDetail(groupId);
    if (!existing) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'GROUP_NOT_FOUND',
        message: 'الحلقة غير موجودة',
      });
    }

    const normalizedName = dto.name.trim();

    // 2. Fast-path duplicate check
    if (normalizedName !== existing.name) {
      const duplicate = await this.groupRepository.findByName(normalizedName);
      if (duplicate && duplicate.id !== groupId) {
        throw new ConflictException({
          statusCode: 409,
          error: 'GROUP_NAME_TAKEN',
          message: 'اسم الحلقة مستخدم بالفعل',
        });
      }
    }

    // 3. Mutate group name
    let updatedGroup: GroupListRow | null;
    try {
      updatedGroup = await this.groupRepository.updateName(
        groupId,
        normalizedName,
      );
      if (!updatedGroup) {
        throw new NotFoundException({
          statusCode: 404,
          error: 'GROUP_NOT_FOUND',
          message: 'الحلقة غير موجودة',
        });
      }
    } catch (err: unknown) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      const errorObj = err as {
        code?: string;
        driverError?: { code?: string };
        detail?: string;
      };
      if (
        errorObj?.code === '23505' ||
        errorObj?.driverError?.code === '23505' ||
        (typeof errorObj?.detail === 'string' &&
          errorObj.detail.includes('already exists'))
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'GROUP_NAME_TAKEN',
          message: 'اسم الحلقة مستخدم بالفعل',
        });
      }
      throw err;
    }

    // 4. Return updated group in envelope
    return {
      data: {
        id: updatedGroup.id,
        name: updatedGroup.name,
        gender: updatedGroup.gender,
        recitation_day: updatedGroup.recitation_day,
        enrollment_status: updatedGroup.enrollment_status,
        lifecycle_state: updatedGroup.lifecycle_state,
        teacher: updatedGroup.teacher,
        assistant: updatedGroup.assistant,
      },
    };
  }
}
