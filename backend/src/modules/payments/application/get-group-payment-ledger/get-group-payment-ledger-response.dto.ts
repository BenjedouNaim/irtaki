import { GroupStudentLedgerDto } from '../payment-ledger.dto';

/**
 * APIS §9.1 collection envelope. API-046 is absent from §9.2's list of
 * cursor-paginated endpoints — the collection is bounded by one group's
 * roster — so it carries no `pagination` key, exactly like the roster
 * (`GET /groups/{id}/memberships`).
 */
export interface GetGroupPaymentLedgerResponseDto {
  data: GroupStudentLedgerDto[];
}
