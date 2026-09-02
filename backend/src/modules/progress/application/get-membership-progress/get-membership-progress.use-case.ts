import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  COVERAGE_REPOSITORY,
  type ICoverageRepository,
} from '../../domain/coverage.repository.interface';
import {
  SURAH_REPOSITORY,
  type ISurahRepository,
} from '../../domain/surah.repository.interface';
import { toProgressDto } from '../progress-summary.mapper';
import { GetMembershipProgressResponseDto } from './get-membership-progress-response.dto';

const MEMBERSHIP_ID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * F-PRG-03 / API-042 `GET /memberships/{id}/progress`.
 *
 * Scope (APIS §6.1): Admin — all; Teacher — memberships of an assigned group
 * only. Resolved by the Progress module's own repository in one indexed
 * lookup with the caller's scope in the predicate (TS §15.2, SA §11).
 * Out-of-scope, non-existent, malformed and no-longer-live ids all get the
 * same 403 (SA §14, NFR-20). Assistant never reaches here (DEC-B09,
 * RolesGuard).
 */
@Injectable()
export class GetMembershipProgressUseCase {
  constructor(
    @Inject(COVERAGE_REPOSITORY)
    private readonly coverageRepository: ICoverageRepository,
    @Inject(SURAH_REPOSITORY)
    private readonly surahRepository: ISurahRepository,
  ) {}

  async execute(
    callerId: string,
    callerRole: UserRole,
    membershipId: string,
  ): Promise<GetMembershipProgressResponseDto> {
    if (callerRole !== UserRole.Admin && callerRole !== UserRole.Teacher) {
      throw new ForbiddenException();
    }

    // A malformed id can match nothing; skip the lookup, keep the same 403.
    const coverage = MEMBERSHIP_ID_SHAPE.test(membershipId)
      ? await this.coverageRepository.findByMembershipIdForStaff(membershipId, {
          callerId,
          isAdmin: callerRole === UserRole.Admin,
        })
      : null;

    if (!coverage) {
      throw new ForbiddenException();
    }

    const surahs = await this.surahRepository.findAll();

    return { data: toProgressDto(coverage, surahs) };
  }
}
