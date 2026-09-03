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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'يجب إدخال التاريخ بصيغة سنة-شهر-يوم (YYYY-MM-DD)';
const PERIOD_MESSAGE =
  'يجب أن تكون الفترة إحدى القيم: week أو month أو 3months أو custom';
export const CUSTOM_RANGE_MESSAGE =
  'يجب تحديد تاريخي البداية والنهاية عند اختيار فترة مخصصة';

export const PERFORMANCE_PERIODS: readonly PerformancePeriodName[] = [
  'week',
  'month',
  '3months',
  'custom',
];

/**
 * APIS §9.3/§10.9: "`custom` requires `from`/`to`". Expressed as a
 * cross-field constraint so the violation reports once, against `period`,
 * in the §9.5 `details[]` shape.
 */
@ValidatorConstraint({ name: 'customPeriodRequiresRange', async: false })
export class CustomPeriodRequiresRange implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as GetOwnPerformanceQueryDto;
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
 * API-037 `GET /me/performance?period=` query (APIS §9.3, §10.9):
 * `period` is `week | month | 3months | custom`, and `custom` REQUIRES both
 * `from` and `to`. An omitted `period` defaults to the current reporting
 * week (UC-07 step 1), resolved in the domain, not here.
 *
 * `from`/`to` are read only when `period = 'custom'`; on any other period
 * they are accepted and ignored — APIS §9.3's posture for a filter that
 * does not apply to the request.
 */
export class GetOwnPerformanceQueryDto {
  @IsOptional()
  @IsIn(PERFORMANCE_PERIODS, { message: PERIOD_MESSAGE })
  @Validate(CustomPeriodRequiresRange)
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
