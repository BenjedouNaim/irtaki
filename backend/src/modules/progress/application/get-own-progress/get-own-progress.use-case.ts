import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
import { GetOwnProgressResponseDto } from './get-own-progress-response.dto';

/**
 * F-PRG-02 / API-041 `GET /me/progress` — a Student reads the coverage of
 * their own active membership (scope: own).
 */
@Injectable()
export class GetOwnProgressUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: IMembershipRepository,
    @Inject(COVERAGE_REPOSITORY)
    private readonly coverageRepository: ICoverageRepository,
    @Inject(SURAH_REPOSITORY)
    private readonly surahRepository: ISurahRepository,
  ) {}

  async execute(userId: string): Promise<GetOwnProgressResponseDto> {
    const membership =
      await this.membershipRepository.findActiveByUserId(userId);
    if (!membership) {
      throw this.notFound();
    }

    const coverage = await this.coverageRepository.findByMembershipId(
      membership.id,
    );
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
