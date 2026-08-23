export type TajweedLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export interface ScoreInput {
  memorizedAhzabCount: number;
  tajweedLevel: TajweedLevel;
  studiedTajweedTheory: boolean;
  studiedQalun: boolean;
}

const TAJWEED_LEVEL_SCORES: Record<TajweedLevel, number> = {
  Beginner: 5,
  Intermediate: 15,
  Advanced: 25,
};

/**
 * Calculates the ApplicantScore according to SAS §18.6 / DMS:
 * Score = (|memorized_ahzab| / 60) * 50 + TajweedLevel + TheoreticalTajweed + Qalun
 *
 * Range: 9.17 to 100.00
 */
export function calculateApplicantScore(input: ScoreInput): number {
  const hizbScore = (input.memorizedAhzabCount / 60) * 50;
  const tajweedScore = TAJWEED_LEVEL_SCORES[input.tajweedLevel] ?? 0;
  const theoryScore = input.studiedTajweedTheory ? 10 : 0;
  const qalunScore = input.studiedQalun ? 15 : 0;

  const rawScore = hizbScore + tajweedScore + theoryScore + qalunScore;

  // Round to 2 decimal places to match NUMERIC(5,2)
  return Math.round(rawScore * 100) / 100;
}
