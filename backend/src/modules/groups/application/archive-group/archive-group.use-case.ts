import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  GROUP_REPOSITORY,
  GroupListRow,
} from '../../domain/group.repository.interface';
import type { IGroupRepository } from '../../domain/group.repository.interface';
import { GroupListItemDto } from '../list-groups/group-list-item.dto';
import { SetLifecycleResponseDto } from '../set-lifecycle/set-lifecycle-response.dto';
import { GroupArchivedEvent } from '../../domain/events/group-archived.event';

@Injectable()
export class ArchiveGroupUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
    private readonly eventEmitter: EventEmitter2,
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

    // 2. BR-42 no-op: if already Archived, return current state unchanged (no DB write, no event emitted)
    if (existing.lifecycle_state === 'Archived') {
      return {
        data: this.mapToDto(existing),
      };
    }

    // 3. Update lifecycle state to Archived with timestamp
    const archivedAt = new Date();
    const updated = await this.groupRepository.updateLifecycle(
      groupId,
      'Archived',
      archivedAt,
    );

    if (!updated) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'GROUP_NOT_FOUND',
        message: 'الحلقة غير موجودة',
      });
    }

    // 4. DEC-D05: Archiving does NOT write an AuditEntry row (explicit specification deviation)

    // 5. Emit DE-10 (GroupArchivedEvent) post-commit, fire-and-forget (ADR-032)
    try {
      this.eventEmitter.emit(
        GroupArchivedEvent.EVENT_NAME,
        new GroupArchivedEvent(groupId, archivedAt),
      );
    } catch {
      // Event emission failure must never block the operation
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
