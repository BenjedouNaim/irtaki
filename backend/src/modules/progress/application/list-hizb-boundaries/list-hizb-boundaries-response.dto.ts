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

export type ListHizbBoundariesResponseDto = HizbBoundaryDto[];
