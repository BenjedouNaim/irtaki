import { AyahRange } from '../../progress/domain/ayah-range';
import {
  DailyReportValidationError,
  DailyReportValidationErrorDetail,
} from './daily-report.errors';
import { TimeWindow } from './time-window';

export type DailyReportType = 'Normal' | 'Absent' | 'Revision';
export type AbsenceReason = 'Sick' | 'Studying' | 'Other';

/**
 * Everything a Student may submit for one report (APIS §10.7 field table),
 * already lifted to value objects by the application layer: ranges are
 * VO-02 AyahRange (BR-52 enforced at construction, TS §23), times are VO-03
 * TimeWindow (VR-15). `undefined` means "not sent".
 */
export interface SubmitDailyReportProps {
  membershipId: string;
  /** `YYYY-MM-DD`, already confirmed to be today (VR-10) by the use case. */
  reportDate: string;
  submittedAt: Date;
  submittedTimezone: string;
  type: DailyReportType;
  absenceReason?: AbsenceReason;
  memoRange?: AyahRange;
  memoTime?: TimeWindow;
  completed50Repetitions?: boolean;
  repetitionsInSingleSession?: boolean;
  revRange?: AyahRange;
  revTime?: TimeWindow;
  readTafsir?: boolean;
}

/**
 * E-05 DailyReport (DMS §7.1, SAS §9.5): one immutable record of one
 * Student's activity on one date, in exactly one of three shapes.
 *
 * The constructor rules below are the domain half of TS §21's validation
 * stack — "`DailyReport` entity rejects an invalid type/field combination":
 *
 * - `Absent`  → `absence_reason` required (VR-19); nothing else allowed.
 * - `Revision` → `rev_range` required (VR-20) with its `rev_time` (VR-17);
 *   no memorisation, repetition or tafsir fields (UF §15).
 * - `Normal`  → `memo_range`/`rev_range` each optional; a report bearing
 *   neither is VALID and counts as a miss on both (BR-48). `memo_time` is
 *   required iff `memo_range` (VR-16), `rev_time` iff `rev_range` (VR-17),
 *   `completed_50_repetitions` iff `memo_range`, and
 *   `repetitions_in_single_session` may only be `true` when the 50
 *   repetitions were completed (VR-18).
 *
 * `no_memorization_today` / `no_revision_today` are derived, not submitted:
 * they are the negation of the corresponding range's presence (DBD §11).
 * Framework-free (TS §9). Instances are frozen — there is no mutation path,
 * matching ST-05 (terminal on creation).
 */
export class DailyReport {
  private constructor(
    public readonly membershipId: string,
    public readonly reportDate: string,
    public readonly type: DailyReportType,
    public readonly submittedAt: Date,
    public readonly submittedTimezone: string,
    public readonly noMemorizationToday: boolean | null,
    public readonly memoRange: AyahRange | null,
    public readonly memoTime: TimeWindow | null,
    public readonly completed50Repetitions: boolean | null,
    public readonly repetitionsInSingleSession: boolean | null,
    public readonly noRevisionToday: boolean | null,
    public readonly revRange: AyahRange | null,
    public readonly revTime: TimeWindow | null,
    public readonly readTafsir: boolean | null,
    public readonly absenceReason: AbsenceReason | null,
  ) {
    Object.freeze(this);
  }

  static submit(props: SubmitDailyReportProps): DailyReport {
    switch (props.type) {
      case 'Absent':
        return DailyReport.submitAbsent(props);
      case 'Revision':
        return DailyReport.submitRevision(props);
      case 'Normal':
        return DailyReport.submitNormal(props);
      default:
        throw new DailyReportValidationError([
          {
            field: 'type',
            rule: 'E-05',
            message: 'نوع التقرير يجب أن يكون Normal أو Absent أو Revision',
          },
        ]);
    }
  }

  private static submitAbsent(props: SubmitDailyReportProps): DailyReport {
    const details: DailyReportValidationErrorDetail[] = [];

    if (!props.absenceReason) {
      details.push({
        field: 'absence_reason',
        rule: 'VR-19',
        message: 'سبب الغياب مطلوب عند نوع الغياب',
      });
    }
    details.push(
      ...DailyReport.forbidden(props, [
        'memoRange',
        'memoTime',
        'completed50Repetitions',
        'repetitionsInSingleSession',
        'revRange',
        'revTime',
        'readTafsir',
      ]),
    );
    DailyReport.assertValid(details);

    return new DailyReport(
      props.membershipId,
      props.reportDate,
      'Absent',
      props.submittedAt,
      props.submittedTimezone,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      props.absenceReason as AbsenceReason,
    );
  }

  private static submitRevision(props: SubmitDailyReportProps): DailyReport {
    const details: DailyReportValidationErrorDetail[] = [];

    if (!props.revRange) {
      details.push({
        field: 'rev_range',
        rule: 'VR-20',
        message: 'نطاق المراجعة مطلوب في تقرير المراجعة',
      });
    }
    if (!props.revTime) {
      details.push({
        field: 'rev_time',
        rule: 'VR-17',
        message: 'وقت المراجعة مطلوب عند إدخال نطاق المراجعة',
      });
    }
    details.push(
      ...DailyReport.forbidden(props, [
        'absenceReason',
        'memoRange',
        'memoTime',
        'completed50Repetitions',
        'repetitionsInSingleSession',
        'readTafsir',
      ]),
    );
    DailyReport.assertValid(details);

    return new DailyReport(
      props.membershipId,
      props.reportDate,
      'Revision',
      props.submittedAt,
      props.submittedTimezone,
      null,
      null,
      null,
      null,
      null,
      false,
      props.revRange as AyahRange,
      props.revTime as TimeWindow,
      null,
      null,
    );
  }

  private static submitNormal(props: SubmitDailyReportProps): DailyReport {
    const details: DailyReportValidationErrorDetail[] = [];
    const hasMemo = props.memoRange !== undefined;
    const hasRev = props.revRange !== undefined;

    // Memorisation section (UF §15 Section A).
    if (hasMemo) {
      if (!props.memoTime) {
        details.push({
          field: 'memo_time',
          rule: 'VR-16',
          message: 'وقت الحفظ مطلوب عند إدخال نطاق الحفظ',
        });
      }
      if (props.completed50Repetitions === undefined) {
        details.push({
          field: 'completed_50_repetitions',
          rule: 'BR-26',
          message: 'يجب تحديد ما إذا أُتمّت التكرارات الخمسون',
        });
      }
      if (
        props.repetitionsInSingleSession === true &&
        props.completed50Repetitions !== true
      ) {
        details.push({
          field: 'repetitions_in_single_session',
          rule: 'VR-18',
          message:
            'لا يمكن اعتبار التكرارات في جلسة واحدة دون إتمام التكرارات الخمسين',
        });
      }
      if (
        props.completed50Repetitions === true &&
        props.repetitionsInSingleSession === undefined
      ) {
        details.push({
          field: 'repetitions_in_single_session',
          rule: 'VR-18',
          message: 'يجب تحديد ما إذا أُنجزت التكرارات في جلسة واحدة',
        });
      }
    } else {
      if (props.memoTime !== undefined) {
        details.push({
          field: 'memo_time',
          rule: 'VR-16',
          message: 'وقت الحفظ غير مسموح به دون نطاق حفظ',
        });
      }
      details.push(
        ...DailyReport.forbidden(props, [
          'completed50Repetitions',
          'repetitionsInSingleSession',
        ]),
      );
    }

    // Revision section (UF §15 Section B).
    if (hasRev) {
      if (!props.revTime) {
        details.push({
          field: 'rev_time',
          rule: 'VR-17',
          message: 'وقت المراجعة مطلوب عند إدخال نطاق المراجعة',
        });
      }
    } else if (props.revTime !== undefined) {
      details.push({
        field: 'rev_time',
        rule: 'VR-17',
        message: 'وقت المراجعة غير مسموح به دون نطاق مراجعة',
      });
    }

    details.push(...DailyReport.forbidden(props, ['absenceReason']));
    DailyReport.assertValid(details);

    // BR-48: neither range is a valid report, counted as a miss on both.
    return new DailyReport(
      props.membershipId,
      props.reportDate,
      'Normal',
      props.submittedAt,
      props.submittedTimezone,
      !hasMemo,
      props.memoRange ?? null,
      props.memoTime ?? null,
      hasMemo ? (props.completed50Repetitions as boolean) : null,
      // VR-18 forces `false` whenever the 50 repetitions were not completed
      // (SAS §18.1 ISS-13 reading); required (validated above) when they were.
      hasMemo
        ? props.completed50Repetitions === true
          ? (props.repetitionsInSingleSession as boolean)
          : false
        : null,
      !hasRev,
      props.revRange ?? null,
      props.revTime ?? null,
      props.readTafsir ?? null,
      null,
    );
  }

  /** APIS §10.7 wire name of each prop, for `details[].field`. */
  private static readonly FIELD_NAMES: Record<
    keyof Omit<
      SubmitDailyReportProps,
      | 'membershipId'
      | 'reportDate'
      | 'submittedAt'
      | 'submittedTimezone'
      | 'type'
    >,
    string
  > = {
    absenceReason: 'absence_reason',
    memoRange: 'memo_range',
    memoTime: 'memo_time',
    completed50Repetitions: 'completed_50_repetitions',
    repetitionsInSingleSession: 'repetitions_in_single_session',
    revRange: 'rev_range',
    revTime: 'rev_time',
    readTafsir: 'read_tafsir',
  };

  /** Fields that must not be sent for the given type (DBD §11 column groups). */
  private static forbidden(
    props: SubmitDailyReportProps,
    keys: (keyof typeof DailyReport.FIELD_NAMES)[],
  ): DailyReportValidationErrorDetail[] {
    return keys
      .filter((key) => props[key] !== undefined)
      .map((key) => ({
        field: DailyReport.FIELD_NAMES[key],
        rule: 'E-05',
        message: `الحقل ${DailyReport.FIELD_NAMES[key]} غير مسموح به لهذا النوع من التقرير`,
      }));
  }

  private static assertValid(
    details: DailyReportValidationErrorDetail[],
  ): void {
    if (details.length > 0) {
      throw new DailyReportValidationError(details);
    }
  }
}
