export const SURAH_REPOSITORY = Symbol('SURAH_REPOSITORY');

export interface SurahRecord {
  number: number;
  nameAr: string;
  ayahCount: number;
  ordinalOffset: number;
}

export interface ISurahRepository {
  findAll(): Promise<SurahRecord[]>;
}
