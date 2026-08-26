export const HIZB_BOUNDARY_REPOSITORY = Symbol('HIZB_BOUNDARY_REPOSITORY');

export interface HizbBoundaryRecord {
  hizbNumber: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

export interface IHizbBoundaryRepository {
  findAll(): Promise<HizbBoundaryRecord[]>;
}
