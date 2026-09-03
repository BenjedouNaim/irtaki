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
@ValidatorConstraint({
  name: 'customMembershipPeriodRequiresRange',
  async: false,
})
export class CustomMembershipPeriodRequiresRange implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as GetMembershipPerformanceQueryDto;
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
 * API-039 `GET /memberships/{id}/performance?period=` query (APIS §9.3,
 * §10.9): "All four accept `?period=week|month|3months|custom&from=&to=`
 * (`custom` requires `from`/`to`)" — the same filter API-037 takes, since
 * §10.9 gives this route "the same shape as `/me/performance`".
 *
 * An omitted `period` defaults to the current reporting week (UC-07 step 1),
 * resolved in the domain, not here. `from`/`to` are read only when
 * `period = 'custom'`; on any other period they are accepted and ignored —
 * APIS §9.3's posture for a filter that does not apply to the request.
 */
export class GetMembershipPerformanceQueryDto {
  @IsOptional()
  @IsIn(PERFORMANCE_PERIODS, { message: PERIOD_MESSAGE })
  @Validate(CustomMembershipPeriodRequiresRange)
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
