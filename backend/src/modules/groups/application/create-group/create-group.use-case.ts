import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import {
  GROUP_REPOSITORY,
  GroupListRow,
  IGroupRepository,
} from '../../domain/group.repository.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../../identity/domain/user.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { AuditEntryTypeOrmEntity } from '../../../identity/infrastructure/audit-entry.typeorm-entity';
import { CreateGroupDto } from './create-group.dto';
import { CreateGroupResponseDto } from './create-group-response.dto';

@Injectable()
export class CreateGroupUseCase {
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
    dto: CreateGroupDto,
  ): Promise<CreateGroupResponseDto> {
    // 1. VR-24: Validate teacher and assistant roles (check both without short-circuiting)
    const [teacher, assistant] = await Promise.all([
      this.userRepository.findById(dto.teacher_id),
      this.userRepository.findById(dto.assistant_id),
    ]);

    const details: Array<{ field: string; rule: string; message: string }> = [];

    if (!teacher || teacher.role !== UserRole.Teacher) {
      details.push({
        field: 'teacher_id',
        rule: 'VR-24',
        message: 'المستخدم المحدد ليس معلماً مؤهلاً',
      });
    }

    if (!assistant || assistant.role !== UserRole.Assistant) {
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

    const normalizedName = dto.name.trim();

    // 2. Fast-path duplicate check
    const existing = await this.groupRepository.findByName(normalizedName);
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        error: 'GROUP_NAME_TAKEN',
        message: 'اسم الحلقة مستخدم بالفعل',
      });
    }

    // 3. Insert new group with explicit 'Closed' and 'Active' statuses
    const groupId = uuidv7();
    let newGroup: GroupListRow;

    try {
      newGroup = await this.groupRepository.create({
        id: groupId,
        name: normalizedName,
        gender: dto.gender,
        recitationDay: dto.recitation_day,
        enrollmentStatus: 'Closed',
        lifecycleState: 'Active',
        teacherId: dto.teacher_id,
        assistantId: dto.assistant_id,
        createdBy: actorId,
      });
    } catch (err: unknown) {
      const errorObj = err as { code?: string; driverError?: { code?: string }; detail?: string };
      if (
        errorObj?.code === '23505' ||
        errorObj?.driverError?.code === '23505' ||
        (typeof errorObj?.detail === 'string' && errorObj.detail.includes('already exists'))
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'GROUP_NAME_TAKEN',
          message: 'اسم الحلقة مستخدم بالفعل',
        });
      }
      throw err;
    }

    // 4. Audit write (best-effort resilience per RegisterUseCase pattern)
    try {
      const audit = new AuditEntryTypeOrmEntity();
      audit.id = uuidv7();
      audit.actorId = actorId;
      audit.action = 'GROUP_CREATED';
      audit.targetType = 'Group';
      audit.targetId = newGroup.id;
      audit.previousValue = null;
      audit.newValue = {
        name: newGroup.name,
        gender: newGroup.gender,
        recitation_day: newGroup.recitation_day,
        teacher_id: dto.teacher_id,
        assistant_id: dto.assistant_id,
        enrollment_status: 'Closed',
        lifecycle_state: 'Active',
      };
      audit.occurredAt = new Date();
      await this.auditRepository.save(audit);
    } catch {
      // Audit failure must not block group creation
    }

    // 5. Return created group DTO
    return {
      data: {
        id: newGroup.id,
        name: newGroup.name,
        gender: newGroup.gender,
        recitation_day: newGroup.recitation_day,
        enrollment_status: newGroup.enrollment_status,
        lifecycle_state: newGroup.lifecycle_state,
        teacher: newGroup.teacher,
        assistant: newGroup.assistant,
      },
    };
  }
}
