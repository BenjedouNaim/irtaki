import type { AbsenceBreakdown } from '../../reports/domain/weekly-metrics-calculator';

/**
 * One member's contribution to the group dashboard — their own DS-03 score
 * plus the two `SubmissionRate` operands and the absence tally that the
 * group-level figures pool (UC-07 step 4/5).
 */
export interface GroupMemberPerformance {
  membershipId: string;
  /** `users.full_name`; nullable, exactly as the column is (never "" ). */
  fullName: string | null;
  /** VO-06's mean of the defined components; null when none is defined. */
  commitmentScore: number | null;
  /** `|D_eff(P)|` for this member — SubmissionRate's denominator (SAS §18.3). */
  effectiveDays: number;
  /** Days in `D_eff(P)` bearing any report — SubmissionRate's numerator. */
  reportedDays: number;
  /** This member's AbsenceReason tally over their expected days in `P`. */
  absenceBreakdown: AbsenceBreakdown;
}

/** One row of API-038's weakest-first `students` list. */
export interface GroupStudentPerformance {
  membershipId: string;
  fullName: string | null;
  commitmentScore: number | null;
}

/** The four API-038 figures, before the wire mapping (APIS §10.9). */
export interface GroupPerformance {
  commitmentAverage: number | null;
  students: GroupStudentPerformance[];
  absenceBreakdown: AbsenceBreakdown;
  submissionRate: number | null;
}

/**
 * Weakest-first ordering (UF §17 "Ascending by commitment score"):
 *
 * - defined scores ascending — the weakest student is the first row the
 *   Teacher reads, which is the whole point of the list (AC-15);
 * - a NULL score is "not enough data" (DEC-B04), not a weak one, so it
 *   sorts AFTER every defined score rather than heading the list as a
 *   fabricated zero would;
 * - ties break on `membership_id` so the order is total and the page is
 *   stable between two reads of the same period.
 */
function weakestFirst(
  a: GroupStudentPerformance,
  b: GroupStudentPerformance,
): number {
  if (a.commitmentScore === null || b.commitmentScore === null) {
    if (a.commitmentScore === b.commitmentScore) {
      return a.membershipId < b.membershipId ? -1 : 1;
    }
    return a.commitmentScore === null ? 1 : -1;
  }
  if (a.commitmentScore !== b.commitmentScore) {
    return a.commitmentScore - b.commitmentScore;
  }
  return a.membershipId < b.membershipId ? -1 : 1;
}

/**
 * UC-07 steps 4–5: the group Commitment average, the weakest-first student
 * list, the pooled absence-reason breakdown and the pooled submission rate,
 * over the member set FR-PERF-09/10 already selected.
 *
 * Two null rules, both DEC-B04:
 * - `commitment_average` is the mean of the **defined** member scores and is
 *   null when none is defined — UC-07 alternative flow 5a, "every student's
 *   Commitment Score is null → the group average displays 'not enough
 *   data'". A null member is skipped, never counted as 0.
 * - `submission_rate` is pooled (`Σ reported / Σ effective`), not a mean of
 *   member rates, so a member with no effective days contributes nothing
 *   instead of dragging the figure; a zero total denominator leaves it null,
 *   which is also UC-07 alternative flow 3a's "no zero-division artefacts".
 *
 * Pure and framework-free (TS §9); nothing is rounded (APIS §11 leaves the
 * percentage as computed, exactly as API-037 does).
 */
export function aggregateGroupPerformance(
  members: readonly GroupMemberPerformance[],
): GroupPerformance {
  const definedScores = members
    .map((member) => member.commitmentScore)
    .filter((score): score is number => score !== null);

  const effectiveDays = members.reduce((sum, m) => sum + m.effectiveDays, 0);
  const reportedDays = members.reduce((sum, m) => sum + m.reportedDays, 0);

  return {
    commitmentAverage:
      definedScores.length === 0
        ? null
        : definedScores.reduce((total, score) => total + score, 0) /
          definedScores.length,
    students: members
      .map((member) => ({
        membershipId: member.membershipId,
        fullName: member.fullName,
        commitmentScore: member.commitmentScore,
      }))
      .sort(weakestFirst),
    absenceBreakdown: {
      sick: members.reduce((sum, m) => sum + m.absenceBreakdown.sick, 0),
      studying: members.reduce(
        (sum, m) => sum + m.absenceBreakdown.studying,
        0,
      ),
      other: members.reduce((sum, m) => sum + m.absenceBreakdown.other, 0),
    },
    submissionRate:
      effectiveDays === 0 ? null : (reportedDays / effectiveDays) * 100,
  };
}
