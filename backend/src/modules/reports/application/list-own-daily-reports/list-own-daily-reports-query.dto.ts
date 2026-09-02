import { IsISO8601, IsOptional, IsString, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'يجب إدخال التاريخ بصيغة سنة-شهر-يوم (YYYY-MM-DD)';

/**
 * API-031 `GET /daily-reports?from=&to=` query (APIS §9.2 cursor params,
 * §9.3 `from`/`to` filter). `limit` is clamped, never rejected (APIS §9.2),
 * so it carries no validator; `cursor` is opaque and decoded by the use case.
 */
export class ListOwnDailyReportsQueryDto {
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
