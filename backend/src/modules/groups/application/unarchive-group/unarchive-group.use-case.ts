import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  GROUP_REPOSITORY,
  GroupListRow,
} from '../../domain/group.repository.interface';
import type { IGroupRepository } from '../../domain/group.repository.interface';
import { GroupListItemDto } from '../list-groups/group-list-item.dto';
import { SetLifecycleResponseDto } from '../set-lifecycle/set-lifecycle-response.dto';

@Injectable()
export class UnarchiveGroupUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
  ) {}

  async execute(
    _actorId: string,
    groupId: string,
  ): Promise<SetLifecycleResponseDto> {
    // 1. Check if group exists (Admin gets 404 on missing group, matching ReassignStaffUseCase)
    const existing = await this.groupRepository.findByIdForDetail(groupId);
    if (!existing) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'GROUP_NOT_FOUND',
        message: 'الحلقة غير موجودة',
      });
    }

    // 2. BR-42 no-op: if already Active, return current state unchanged
    if (existing.lifecycle_state === 'Active') {
      return {
        data: this.mapToDto(existing),
      };
    }

    // 3. Guarded flip back to Active (TS §20). Step 2's read is a fast path;
    //    the `WHERE lifecycle_state = 'Archived'` predicate inside the UPDATE
    //    is what decides, so this can never overwrite an archive that
    //    committed in between — one whose FR-REQ-08 cascade has already
    //    rejected the group's whole Pending queue, irreversibly (APIS §10.4).
    const { group: updated } = await this.groupRepository.unarchive(groupId);

    if (!updated) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'GROUP_NOT_FOUND',
        message: 'الحلقة غير موجودة',
      });
    }

    // 4. DEC-D05: Un-archiving does NOT write an AuditEntry row
    // 5. DE-11 (GroupUnarchivedEvent) is marked "Useful" in DMS.md and is out of MVP scope

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
