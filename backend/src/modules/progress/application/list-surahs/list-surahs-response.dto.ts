export interface SurahDto {
  number: number;
  name_ar: string;
  ayah_count: number;
  ordinal_offset: number;
}

export type ListSurahsResponseDto = SurahDto[];
