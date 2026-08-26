import { SurahDto } from '../../../shared/api/quran.client';

/**
 * Single Quran ayah coordinate and value object (DMS VO-01 / wire shape).
 */
export interface AyahPosition {
  surah: number;
  ayah: number;
}

/**
 * Continuous range between two Quran ayah positions (DMS VO-02 / memo_range/rev_range wire shape).
 */
export interface AyahRange {
  from: AyahPosition;
  to: AyahPosition;
}

/**
 * Builds a quick lookup map of surah number -> SurahDto from the surahs reference list.
 */
export function buildSurahIndex(surahs: SurahDto[]): Map<number, SurahDto> {
  const map = new Map<number, SurahDto>();
  for (const surah of surahs) {
    map.set(surah.number, surah);
  }
  return map;
}

/**
 * Converts a {surah, ayah} position into a canonical 1-based mushaf ordinal.
 * Returns surah.ordinal_offset + ayah.
 */
export function toOrdinal(
  surahIndex: Map<number, SurahDto>,
  position: AyahPosition,
): number {
  const surah = surahIndex.get(position.surah);
  if (!surah) {
    return NaN;
  }
  return surah.ordinal_offset + position.ayah;
}

/**
 * Compares two ayah positions by ordinal.
 * Returns negative if a < b, 0 if a == b, positive if a > b.
 */
export function compareAyahPositions(
  surahIndex: Map<number, SurahDto>,
  a: AyahPosition,
  b: AyahPosition,
): number {
  return toOrdinal(surahIndex, a) - toOrdinal(surahIndex, b);
}

/**
 * Determines whether a candidate TO-ayah position is disabled according to VR-14a (mushaf order).
 * A candidate is disabled if it resolves to an ordinal strictly less than fromPosition.
 * If fromPosition is not set, no disabling is applied.
 */
export function isAyahDisabledForTo(
  surahIndex: Map<number, SurahDto>,
  fromPosition: AyahPosition | undefined,
  candidate: AyahPosition,
): boolean {
  if (!fromPosition) {
    return false;
  }
  const fromOrdinal = toOrdinal(surahIndex, fromPosition);
  const candidateOrdinal = toOrdinal(surahIndex, candidate);

  if (Number.isNaN(fromOrdinal) || Number.isNaN(candidateOrdinal)) {
    return false;
  }

  return candidateOrdinal < fromOrdinal;
}
