import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GROUP_REPOSITORY,
  type IGroupRepository,
} from '../../../groups/domain/group.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  MEMBERSHIP_REPOSITORY,
  type IMembershipRepository,
} from '../../../memberships/domain/membership.repository.interface';
import {
  COVERAGE_REPOSITORY,
  type ICoverageRepository,
} from '../../domain/coverage.repository.interface';
import {
  SURAH_REPOSITORY,
  type ISurahRepository,
} from '../../domain/surah.repository.interface';
import { toProgressDto } from '../progress-summary.mapper';
import { GetStudentProgressResponseDto } from './get-student-progress-response.dto';

const MEMBERSHIP_ID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * F-PRG-03 / API-042 `GET /memberships/{id}/progress`.
 *
 * Scope (APIS §6.1): Admin — all; Teacher — memberships of an assigned group
 * only, with the uniform 403 for anything out of scope or non-existent
 * (NFR-20). Assistant never reaches here (DEC-B09, RolesGuard).
 */
@Injectable()
export class GetStudentProgressUseCase {
  constructor(
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: IMembershipRepository,
    @Inject(COVERAGE_REPOSITORY)
    private readonly coverageRepository: ICoverageRepository,
    @Inject(SURAH_REPOSITORY)
    private readonly surahRepository: ISurahRepository,
  ) {}

  async execute(
    callerId: string,
    callerRole: UserRole,
    membershipId: string,
  ): Promise<GetStudentProgressResponseDto> {
    const membership = MEMBERSHIP_ID_SHAPE.test(membershipId)
      ? await this.membershipRepository.findScopeById(membershipId)
      : null;

    if (callerRole === UserRole.Teacher) {
      if (!membership) {
        throw new ForbiddenException();
      }
      const assigned =
        await this.groupRepository.findByStaffIdForList(callerId);
      if (!assigned.some((group) => group.id === membership.groupId)) {
        throw new ForbiddenException();
      }
    } else if (callerRole === UserRole.Admin) {
      if (!membership) {
        throw this.notFound();
      }
    } else {
      throw new ForbiddenException();
    }

    const coverage =
      await this.coverageRepository.findByMembershipId(membershipId);
    if (!coverage) {
      throw this.notFound();
    }

    const surahs = await this.surahRepository.findAll();

    return { data: toProgressDto(coverage, surahs) };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      error: 'NOT_FOUND',
      message: 'المورد المطلوب غير موجود',
    });
  }
}
