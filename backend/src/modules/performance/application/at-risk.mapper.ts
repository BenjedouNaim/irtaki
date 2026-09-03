import type { AtRiskStudent } from '../domain/at-risk-detection';
import type { AtRiskEntryDto } from './get-at-risk-list/at-risk-list-response.dto';

/**
 * Folds a DS-04 result into the API-040 wire shape (APIS §11:
 * `DomainEntity ↛ ResponseDTO`, built by an application-layer mapper).
 *
 * Nothing is coerced: a null `full_name` stays null (never `""`), and the
 * day count is passed through as counted.
 */
export function toAtRiskEntryDto(student: AtRiskStudent): AtRiskEntryDto {
  return {
    membership_id: student.membershipId,
    full_name: student.fullName,
    days_since_last_report: student.daysSinceLastReport,
  };
}
