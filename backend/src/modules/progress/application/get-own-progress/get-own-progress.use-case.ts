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
import { GetOwnProgressResponseDto } from './get-own-progress-response.dto';

/**
 * F-PRG-02 / API-041 `GET /me/progress` — a Student reads the coverage of
 * their own active membership (scope: own).
 *
 * Scope is resolved by the Progress module's own repository in one indexed
 * lookup (TS §15.2, SA §11: Progress calls into no other module). A Student
 * with no active membership gets `404 NOT_FOUND`, mirroring
 * `GET /memberships/mine` (APIQ-NEW-06).
 */
@Injectable()
export class GetOwnProgressUseCase {
  constructor(
    @Inject(COVERAGE_REPOSITORY)
    private readonly coverageRepository: ICoverageRepository,
    @Inject(SURAH_REPOSITORY)
    private readonly surahRepository: ISurahRepository,
  ) {}

  async execute(userId: string): Promise<GetOwnProgressResponseDto> {
    const coverage = await this.coverageRepository.findActiveByUserId(userId);
    if (!coverage) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    const surahs = await this.surahRepository.findAll();

    return { data: toProgressDto(coverage, surahs) };
  }
}
