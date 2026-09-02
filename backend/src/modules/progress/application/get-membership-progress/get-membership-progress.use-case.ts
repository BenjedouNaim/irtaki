import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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

/**
 * F-PRG-03 / API-042 `GET /memberships/{id}/progress`.
 *
 * Staff scope is validated upstream by MembershipProgressScopeGuard (TS §15.2).
 * Admin bypasses ScopeGuard (DEC-C07); Teacher scope is verified before handler runs.
 * If the membership or live coverage does not exist, returns 404 NOT_FOUND.
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
    membershipId: string,
  ): Promise<GetMembershipProgressResponseDto> {
    const coverage =
      await this.coverageRepository.findByMembershipId(membershipId);

    if (!coverage) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Membership not found',
      });
    }

    const surahs = await this.surahRepository.findAll();

    return { data: toProgressDto(coverage, surahs) };
  }
}
