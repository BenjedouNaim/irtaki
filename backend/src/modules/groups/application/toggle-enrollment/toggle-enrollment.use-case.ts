import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import {
  GROUP_REPOSITORY,
  GroupListRow,
} from '../../domain/group.repository.interface';
import type { IGroupRepository } from '../../domain/group.repository.interface';
import { AuditEntryTypeOrmEntity } from '../../../identity/infrastructure/audit-entry.typeorm-entity';
import { GroupListItemDto } from '../list-groups/group-list-item.dto';
import { ToggleEnrollmentDto } from './toggle-enrollment.dto';
import { ToggleEnrollmentResponseDto } from './toggle-enrollment-response.dto';

@Injectable()
export class ToggleEnrollmentUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
    @InjectRepository(AuditEntryTypeOrmEntity)
    private readonly auditRepository: Repository<AuditEntryTypeOrmEntity>,
  ) {}

  async execute(
    actorId: string,
    groupId: string,
    dto: ToggleEnrollmentDto,
  ): Promise<ToggleEnrollmentResponseDto> {
    // 1. Fetch the group
    const existing = await this.groupRepository.findByIdForDetail(groupId);

    // 2. AC-17 scope check: if not found or caller is not the assigned teacher, throw ForbiddenException (masked)
    if (!existing || existing.teacher.id !== actorId) {
      throw new ForbiddenException();
    }

    // 3. BR-42 no-op fast path: if archived, return current unchanged state
    //    with no DB write and no audit entry. This read is only the early
    //    exit — the authoritative guard is the `lifecycle_state = 'Active'`
    //    predicate on the UPDATE in step 4 (TS §20).
    if (existing.lifecycle_state === 'Archived') {
      return {
        data: this.mapToDto(existing),
      };
    }

    // 4. Guarded update: writes only while the group is still Active.
    const updated = await this.groupRepository.updateEnrollmentStatus(
      groupId,
      dto.enrollment_status,
    );

    // 4a. 0 rows means the group stopped being Active between the read above
    //     and this write. That is the same BR-42 no-op as step 3, reached
    //     through the TOCTOU window instead of the fast path: 200 with the
    //     unchanged state (APIS §10.4), no audit entry. Re-read so the caller
    //     sees the state that actually won, not the stale snapshot; a row that
    //     has since disappeared stays masked as 403 like step 2.
    if (!updated) {
      const current = await this.groupRepository.findByIdForDetail(groupId);
      if (!current) {
        throw new ForbiddenException();
      }
      return {
        data: this.mapToDto(current),
      };
    }

    // 5. Best-effort audit write
    try {
      const audit = new AuditEntryTypeOrmEntity();
      audit.id = uuidv7();
      audit.actorId = actorId;
      audit.action = 'ENROLLMENT_TOGGLED';
      audit.targetType = 'Group';
      audit.targetId = groupId;
      audit.previousValue = {
        enrollment_status: existing.enrollment_status,
      };
      audit.newValue = {
        enrollment_status: updated.enrollment_status,
      };
      audit.occurredAt = new Date();
      await this.auditRepository.save(audit);
    } catch {
      // Audit write failure must not block the action
    }

    // 6. Return updated group in envelope
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
