import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import type { PerformancePeriodName } from '../../domain/performance-period';
import {
  CUSTOM_RANGE_MESSAGE,
  PERFORMANCE_PERIODS,
} from '../get-own-performance/get-own-performance-query.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'يجب إدخال التاريخ بصيغة سنة-شهر-يوم (YYYY-MM-DD)';
const PERIOD_MESSAGE =
  'يجب أن تكون الفترة إحدى القيم: week أو month أو 3months أو custom';

/**
 * APIS §9.3/§10.9: "`custom` requires `from`/`to`" — the same cross-field
 * constraint API-037 applies, restated against this DTO's own type so the
 * violation reports once, against `period`, in the §9.5 `details[]` shape.
 */
@ValidatorConstraint({ name: 'customGroupPeriodRequiresRange', async: false })
export class CustomGroupPeriodRequiresRange implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as GetGroupPerformanceQueryDto;
    return (
      dto.period !== 'custom' ||
      (typeof dto.from === 'string' && typeof dto.to === 'string')
    );
  }

  defaultMessage(): string {
    return CUSTOM_RANGE_MESSAGE;
  }
}

/**
 * API-038 `GET /groups/{id}/performance?period=` query (APIS §9.3, §10.9):
 * "All four accept `?period=week|month|3months|custom&from=&to=` (`custom`
 * requires `from`/`to`)" — the same filter API-037 takes, so the two
 * dashboards can never disagree about what a period means (FR-PERF-03).
 *
 * An omitted `period` defaults to the current reporting week (UC-07 step 1
 * "default is the current reporting week"), resolved in the domain.
 */
export class GetGroupPerformanceQueryDto {
  @IsOptional()
  @IsIn(PERFORMANCE_PERIODS, { message: PERIOD_MESSAGE })
  @Validate(CustomGroupPeriodRequiresRange)
  period?: PerformancePeriodName;

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
}
