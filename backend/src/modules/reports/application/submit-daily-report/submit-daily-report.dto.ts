import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** VO-01 as submitted: a (surah, ayah) pair — never an ordinal (APIS §11). */
export class AyahPositionInputDto {
  @IsInt({ message: 'رقم السورة يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'رقم السورة يجب أن يكون بين 1 و 114' })
  @Max(114, { message: 'رقم السورة يجب أن يكون بين 1 و 114' })
  surah!: number;

  @IsInt({ message: 'رقم الآية يجب أن يكون عدداً صحيحاً' })
  @Min(1, { message: 'رقم الآية يجب أن يكون أكبر من 0' })
  ayah!: number;
}

/** `{ from: {surah, ayah}, to: {surah, ayah} }` (APIS §10.7). */
export class AyahRangeInputDto {
  @IsDefined({ message: 'بداية النطاق مطلوبة' })
  @ValidateNested()
  @Type(() => AyahPositionInputDto)
  from!: AyahPositionInputDto;

  @IsDefined({ message: 'نهاية النطاق مطلوبة' })
  @ValidateNested()
  @Type(() => AyahPositionInputDto)
  to!: AyahPositionInputDto;
}

const HOUR_MINUTE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** VO-03 as submitted: `{ from: 'HH:MM', to: 'HH:MM' }`. Order (VR-15) is a domain rule. */
export class TimeWindowInputDto {
  @Matches(HOUR_MINUTE, {
    message: 'يجب إدخال وقت البداية بصيغة ساعة:دقيقة (HH:MM)',
  })
  from!: string;

  @Matches(HOUR_MINUTE, {
    message: 'يجب إدخال وقت الانتهاء بصيغة ساعة:دقيقة (HH:MM)',
  })
  to!: string;
}

export const DAILY_REPORT_TYPES = ['Normal', 'Absent', 'Revision'] as const;
export const ABSENCE_REASONS = ['Sick', 'Studying', 'Other'] as const;

/**
 * `SubmitDailyReportDto` (TS §13) — API-030 request body, a discriminated
 * union on `type` per the APIS §10.7 field table. This transport layer
 * validates shape, types and the *required* subset per type (TS §21);
 * the forbidden-for-this-type side and the cross-field business rules
 * (VR-15…VR-18, BR-52) belong to the `DailyReport` entity and the VOs.
 *
 * `whitelist: true, forbidNonWhitelisted: true` (app.module) rejects any
 * property not declared here — `no_memorization_today` / `no_revision_today`
 * are derived server-side and never accepted from the client.
 */
export class SubmitDailyReportDto {
  @IsIn(DAILY_REPORT_TYPES, {
    message: 'نوع التقرير يجب أن يكون Normal أو Absent أو Revision',
  })
  type!: (typeof DAILY_REPORT_TYPES)[number];

  /**
   * `YYYY-MM-DD` the client is reporting for (SAS E-05 `report_date`,
   * VR-10). Optional on the wire — the APIS §12 example omits it — and, when
   * present, must equal today in the student's persisted timezone or the
   * request is `422 BACKDATED` (no grace period). Omitted → today.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'تاريخ التقرير يجب أن يكون بصيغة YYYY-MM-DD',
  })
  report_date?: string;

  /** Required iff `type = Absent` (VR-19). */
  @ValidateIf(
    (o: SubmitDailyReportDto) =>
      o.type === 'Absent' || o.absence_reason !== undefined,
  )
  @IsIn(ABSENCE_REASONS, {
    message:
      'سبب الغياب مطلوب عند نوع الغياب، ويجب أن يكون Sick أو Studying أو Other',
  })
  absence_reason?: (typeof ABSENCE_REASONS)[number];

  /** Optional, `Normal` only (VR-13, VR-14, VR-14a). */
  @IsOptional()
  @ValidateNested()
  @Type(() => AyahRangeInputDto)
  memo_range?: AyahRangeInputDto;

  /** Required iff `memo_range` present (VR-15, VR-16). */
  @ValidateIf(
    (o: SubmitDailyReportDto) =>
      o.memo_range !== undefined || o.memo_time !== undefined,
  )
  @IsDefined({ message: 'وقت الحفظ مطلوب عند إدخال نطاق الحفظ' })
  @ValidateNested()
  @Type(() => TimeWindowInputDto)
  memo_time?: TimeWindowInputDto;

  /** `Normal` with `memo_range`. */
  @ValidateIf(
    (o: SubmitDailyReportDto) =>
      o.memo_range !== undefined || o.completed_50_repetitions !== undefined,
  )
  @IsBoolean({
    message: 'يجب تحديد ما إذا أُتمّت التكرارات الخمسون (نعم/لا)',
  })
  completed_50_repetitions?: boolean;

  /** Only `true` if `completed_50_repetitions = true` (VR-18). */
  @IsOptional()
  @IsBoolean({
    message: 'التكرارات في جلسة واحدة يجب أن تكون قيمة منطقية (نعم/لا)',
  })
  repetitions_in_single_session?: boolean;

  /** `Normal` (optional) / `Revision` (required, VR-20). */
  @ValidateIf(
    (o: SubmitDailyReportDto) =>
      o.type === 'Revision' || o.rev_range !== undefined,
  )
  @IsDefined({ message: 'نطاق المراجعة مطلوب في تقرير المراجعة' })
  @ValidateNested()
  @Type(() => AyahRangeInputDto)
  rev_range?: AyahRangeInputDto;

  /** Required iff `rev_range` present (VR-15, VR-17). */
  @ValidateIf(
    (o: SubmitDailyReportDto) =>
      o.rev_range !== undefined || o.rev_time !== undefined,
  )
  @IsDefined({ message: 'وقت المراجعة مطلوب عند إدخال نطاق المراجعة' })
  @ValidateNested()
  @Type(() => TimeWindowInputDto)
  rev_time?: TimeWindowInputDto;

  /** Optional, `Normal` only — informational (ISS-12). */
  @IsOptional()
  @IsBoolean({ message: 'قراءة التفسير يجب أن تكون قيمة منطقية (نعم/لا)' })
  read_tafsir?: boolean;
}
