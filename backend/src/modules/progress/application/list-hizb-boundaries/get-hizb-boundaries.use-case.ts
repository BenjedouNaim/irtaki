import { Inject, Injectable } from '@nestjs/common';
import {
  HIZB_BOUNDARY_REPOSITORY,
  type IHizbBoundaryRepository,
} from '../../domain/hizb-boundary.repository.interface';
import { ListHizbBoundariesResponseDto } from './list-hizb-boundaries-response.dto';

@Injectable()
export class GetHizbBoundariesUseCase {
  constructor(
    @Inject(HIZB_BOUNDARY_REPOSITORY)
    private readonly hizbBoundaryRepository: IHizbBoundaryRepository,
  ) {}

  async execute(): Promise<ListHizbBoundariesResponseDto> {
    const boundaries = await this.hizbBoundaryRepository.findAll();

    return boundaries.map((b) => ({
      hizb_number: b.hizbNumber,
      start: {
        surah: b.startSurah,
        ayah: b.startAyah,
      },
      end: {
        surah: b.endSurah,
        ayah: b.endAyah,
      },
    }));
  }
}
