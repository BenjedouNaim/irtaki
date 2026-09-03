import type { GroupPerformance } from '../domain/group-performance';
import type { GroupPerformanceDto } from './get-group-performance/group-performance-response.dto';

/**
 * Folds the domain aggregate into the API-038 wire shape (APIS §11:
 * `DomainEntity ↛ ResponseDTO`, built by an application-layer mapper).
 *
 * Nothing is rounded or coerced: a null average or rate stays null
 * (DEC-B04), and the student order is preserved exactly as the domain
 * sorted it — weakest first (UF §17).
 */
export function toGroupPerformanceDto(
  aggregate: GroupPerformance,
): GroupPerformanceDto {
  return {
    commitment_average: aggregate.commitmentAverage,
    students: aggregate.students.map((student) => ({
      membership_id: student.membershipId,
      full_name: student.fullName,
      commitment_score: student.commitmentScore,
    })),
    absence_breakdown: {
      sick: aggregate.absenceBreakdown.sick,
      studying: aggregate.absenceBreakdown.studying,
      other: aggregate.absenceBreakdown.other,
    },
    submission_rate: aggregate.submissionRate,
  };
}
