import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import {
  GROUP_REPOSITORY,
  GroupListRow,
} from '../../domain/group.repository.interface';
import type { IGroupRepository } from '../../domain/group.repository.interface';
import { USER_REPOSITORY } from '../../../identity/domain/user.repository.interface';
import type { IUserRepository } from '../../../identity/domain/user.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { AuditEntryTypeOrmEntity } from '../../../identity/infrastructure/audit-entry.typeorm-entity';
import { GroupListItemDto } from '../list-groups/group-list-item.dto';
import { ReassignStaffDto } from './reassign-staff.dto';
import { ReassignStaffResponseDto } from './reassign-staff-response.dto';

@Injectable()
export class ReassignStaffUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @InjectRepository(AuditEntryTypeOrmEntity)
    private readonly auditRepository: Repository<AuditEntryTypeOrmEntity>,
  ) {}

  async execute(
    actorId: string,
    groupId: string,
    dto: ReassignStaffDto,
  ): Promise<ReassignStaffResponseDto> {
    // 1. Check if group exists
    const existing = await this.groupRepository.findByIdForDetail(groupId);
    if (!existing) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'GROUP_NOT_FOUND',
        message: 'الحلقة غير موجودة',
      });
    }

    // 2. Validate that at least one field is provided
    if (dto.teacher_id === undefined && dto.assistant_id === undefined) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'بيانات غير صالحة',
        details: [
          {
            field: 'staff',
            rule: 'VR-24',
            message: 'يجب تحديد المعلم أو المساعد الإداري على الأقل',
          },
        ],
      });
    }

    // 3. VR-24: Validate roles of provided users (check both without short-circuiting)
    const [teacher, assistant] = await Promise.all([
      dto.teacher_id !== undefined
        ? this.userRepository.findById(dto.teacher_id)
        : Promise.resolve(null),
      dto.assistant_id !== undefined
        ? this.userRepository.findById(dto.assistant_id)
        : Promise.resolve(null),
    ]);

    const details: Array<{ field: string; rule: string; message: string }> = [];

    if (
      dto.teacher_id !== undefined &&
      (!teacher || teacher.role !== UserRole.Teacher)
    ) {
      details.push({
        field: 'teacher_id',
        rule: 'VR-24',
        message: 'المستخدم المحدد ليس معلماً مؤهلاً',
      });
    }

    if (
      dto.assistant_id !== undefined &&
      (!assistant || assistant.role !== UserRole.Assistant)
    ) {
      details.push({
        field: 'assistant_id',
        rule: 'VR-24',
        message: 'المستخدم المحدد ليس مساعداً إدارياً مؤهلاً',
      });
    }

    if (details.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'بيانات غير صالحة',
        details,
      });
    }

    // 4. Same-user no-op check: if all provided fields match current holders, return current state
    const teacherUnchanged =
      dto.teacher_id === undefined || dto.teacher_id === existing.teacher.id;
    const assistantUnchanged =
      dto.assistant_id === undefined ||
      dto.assistant_id === existing.assistant.id;

    if (teacherUnchanged && assistantUnchanged) {
      return {
        data: this.mapToDto(existing),
      };
    }

    // 5. Update staff fields
    const updateFields: { teacherId?: string; assistantId?: string } = {};
    if (
      dto.teacher_id !== undefined &&
      dto.teacher_id !== existing.teacher.id
    ) {
      updateFields.teacherId = dto.teacher_id;
    }
    if (
      dto.assistant_id !== undefined &&
      dto.assistant_id !== existing.assistant.id
    ) {
      updateFields.assistantId = dto.assistant_id;
    }

    const updated = await this.groupRepository.updateStaff(
      groupId,
      updateFields,
    );
    if (!updated) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'GROUP_NOT_FOUND',
        message: 'الحلقة غير موجودة',
      });
    }

    // 6. Best-effort audit write
    try {
      const previousValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};

      if (
        dto.teacher_id !== undefined &&
        dto.teacher_id !== existing.teacher.id
      ) {
        previousValue.teacher_id = existing.teacher.id;
        newValue.teacher_id = dto.teacher_id;
      }

      if (
        dto.assistant_id !== undefined &&
        dto.assistant_id !== existing.assistant.id
      ) {
        previousValue.assistant_id = existing.assistant.id;
        newValue.assistant_id = dto.assistant_id;
      }

      const audit = new AuditEntryTypeOrmEntity();
      audit.id = uuidv7();
      audit.actorId = actorId;
      audit.action = 'STAFF_REASSIGNED';
      audit.targetType = 'Group';
      audit.targetId = groupId;
      audit.previousValue = previousValue;
      audit.newValue = newValue;
      audit.occurredAt = new Date();
      await this.auditRepository.save(audit);
    } catch {
      // Audit failure must not block staff reassignment
    }

    // 7. Return updated group DTO
    return {
      data: this.mapToDto(updated),
    };
  }

  private mapToDto(row: GroupListRow): GroupListItemDto {
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
}
