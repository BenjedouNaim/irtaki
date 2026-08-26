import { Inject, Injectable } from '@nestjs/common';
import { SURAH_REPOSITORY } from '../../domain/surah.repository.interface';
import type { ISurahRepository } from '../../domain/surah.repository.interface';
import { ListSurahsResponseDto } from './list-surahs-response.dto';

@Injectable()
export class ListSurahsUseCase {
  constructor(
    @Inject(SURAH_REPOSITORY)
    private readonly surahRepository: ISurahRepository,
  ) {}

  async execute(): Promise<ListSurahsResponseDto> {
    const surahs = await this.surahRepository.findAll();

    return surahs.map((surah) => ({
      number: surah.number,
      name_ar: surah.nameAr,
      ayah_count: surah.ayahCount,
      ordinal_offset: surah.ordinalOffset,
    }));
  }
}
