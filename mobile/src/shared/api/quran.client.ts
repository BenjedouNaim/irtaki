import { apiClient } from './client';

export interface SurahDto {
  number: number;
  name_ar: string;
  ayah_count: number;
  ordinal_offset: number;
}

export interface HizbBoundaryDto {
  hizb_number: number;
  start: {
    surah: number;
    ayah: number;
  };
  end: {
    surah: number;
    ayah: number;
  };
}

export type ListSurahsResponse = SurahDto[];
export type ListHizbBoundariesResponse = HizbBoundaryDto[];

/**
 * Lists all 114 Surahs with their metadata.
 * Note: The backend endpoint returns a raw array (SurahDto[]), not wrapped in `{ data: [...] }`.
 */
export async function listSurahs(): Promise<SurahDto[]> {
  return apiClient.get<SurahDto[]>('/quran/surahs');
}

/**
 * Lists all 60 Hizb boundaries.
 * Note: The backend endpoint returns a raw array (HizbBoundaryDto[]), not wrapped in `{ data: [...] }`.
 */
export async function listHizbBoundaries(): Promise<HizbBoundaryDto[]> {
  return apiClient.get<HizbBoundaryDto[]>('/quran/hizb-boundaries');
}
