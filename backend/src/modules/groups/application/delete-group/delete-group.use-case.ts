import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GROUP_REPOSITORY } from '../../domain/group.repository.interface';
import type { IGroupRepository } from '../../domain/group.repository.interface';

@Injectable()
export class DeleteGroupUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
  ) {}

  async execute(_actorId: string, groupId: string): Promise<void> {
    // 1. Check if group exists (404 if missing)
    const existing = await this.groupRepository.findByIdForDetail(groupId);
    if (!existing) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'GROUP_NOT_FOUND',
        message: 'الحلقة غير موجودة',
      });
    }

    // 2. BR-43: Check if group has ever had a Membership (past or present)
    const hasHistory = await this.groupRepository.hasMembershipHistory(groupId);
    if (hasHistory) {
      throw new ConflictException({
        statusCode: 409,
        error: 'GROUP_HAS_HISTORY',
        message: 'لا يمكن حذف حلقة سبق أن انضم إليها طلاب',
      });
    }

    // 3. Perform hard delete (and transactional cleanup of any join_requests rows)
    const deleted = await this.groupRepository.deleteById(groupId);
    if (!deleted) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'GROUP_NOT_FOUND',
        message: 'الحلقة غير موجودة',
      });
    }

    // Note: No domain events emitted and no AuditEntry written per spec (BR-43 / SAS §2799)
  }
}
