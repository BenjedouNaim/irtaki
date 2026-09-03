import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { AUDITED_ACTIONS, AuditAction } from '../../domain/audit-action.enum';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'يجب إدخال التاريخ بصيغة سنة-شهر-يوم (YYYY-MM-DD)';

/**
 * API-054 `GET /audit?action=&from=&to=` query. `action` is the one named
 * filter for this endpoint (APIS §9.3) and accepts only the three audited
 * actions (§9.9) — anything else is a `422`, the same posture the `role`
 * filter takes on API-053. `from`/`to` are `YYYY-MM-DD` calendar dates.
 * `limit` is clamped, never rejected (APIS §9.2), so it carries no
 * validator; `cursor` is opaque and decoded by the use case.
 */
export class GetAuditLogQueryDto {
  @IsOptional()
  @IsIn(AUDITED_ACTIONS as readonly string[], {
    message: 'الإجراء المحدد غير صالح',
  })
  action?: AuditAction;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  to?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  limit?: string | number;
}
