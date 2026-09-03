import {
  AbsenceReason,
  AyahRangeDto,
  DailyReportType,
  SubmitDailyReportPayload,
} from '@/shared/api/dailyReports.client';

export type YesNo = 'yes' | 'no';

/** A time window under entry — either bound may still be unset. */
export interface TimeWindowDraft {
  from: string | null;
  to: string | null;
}

/**
 * SCR-10 form state (TS §26: React Hook Form, local to the screen). The two
 * gate questions have NO default (UF §15) — `null` means unanswered.
 */
export interface DailyReportFormValues {
  memoGate: YesNo | null;
  memo_range: AyahRangeDto | null;
  memo_time: TimeWindowDraft;
  completed_50_repetitions: boolean | null;
  repetitions_in_single_session: boolean | null;
  revGate: YesNo | null;
  rev_range: AyahRangeDto | null;
  rev_time: TimeWindowDraft;
  read_tafsir: boolean | null;
  absence_reason: AbsenceReason | null;
}

export const EMPTY_FORM_VALUES: DailyReportFormValues = {
  memoGate: null,
  memo_range: null,
  memo_time: { from: null, to: null },
  completed_50_repetitions: null,
  repetitions_in_single_session: null,
  revGate: null,
  rev_range: null,
  rev_time: { from: null, to: null },
  read_tafsir: null,
  absence_reason: null,
};

export const DAILY_REPORT_TYPES: DailyReportType[] = [
  'Normal',
  'Absent',
  'Revision',
];

export function isDailyReportType(value: unknown): value is DailyReportType {
  return (
    typeof value === 'string' &&
    (DAILY_REPORT_TYPES as string[]).includes(value)
  );
}

/**
 * The device's local calendar date as `YYYY-MM-DD` — what the form was
 * opened for. The server re-derives "today" from the persisted
 * `User.timezone` (T-01) and answers `422 BACKDATED` if they disagree
 * (VR-10, UF §15 "midnight crossed mid-entry").
 */
export function localTodayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Client-side VR-15 nudge, same tone as the server's (UF §20). */
export const TIME_ORDER_MESSAGE = 'يجب أن يكون وقت الانتهاء بعد وقت البداية';

export function timeWindowError(window: TimeWindowDraft): string | undefined {
  if (window.from && window.to && window.to <= window.from) {
    return TIME_ORDER_MESSAGE;
  }
  return undefined;
}

function isCompleteWindow(window: TimeWindowDraft): boolean {
  return window.from !== null && window.to !== null && !timeWindowError(window);
}

/**
 * UF §15 "Submit disabled until minimum fields satisfied", per type:
 * - Normal: both gates answered; an opted-in section needs its range, time
 *   and (memorisation) the 50-repetitions answer, plus the single-session
 *   answer only when the 50 repetitions were completed.
 * - Absent: a reason.
 * - Revision: range and time.
 * A Normal report with both gates "No" is complete (BR-48).
 */
export function isFormComplete(
  type: DailyReportType,
  v: DailyReportFormValues,
): boolean {
  switch (type) {
    case 'Absent':
      return v.absence_reason !== null;
    case 'Revision':
      return v.rev_range !== null && isCompleteWindow(v.rev_time);
    case 'Normal': {
      if (v.memoGate === null || v.revGate === null) {
        return false;
      }
      if (v.memoGate === 'yes') {
        if (
          v.memo_range === null ||
          !isCompleteWindow(v.memo_time) ||
          v.completed_50_repetitions === null
        ) {
          return false;
        }
        if (
          v.completed_50_repetitions === true &&
          v.repetitions_in_single_session === null
        ) {
          return false;
        }
      }
      if (v.revGate === 'yes') {
        if (v.rev_range === null || !isCompleteWindow(v.rev_time)) {
          return false;
        }
      }
      return true;
    }
  }
}

/**
 * Builds the API-030 body (APIS §10.7) from the form. Only the fields the
 * chosen type accepts are sent — a "No" gate sends nothing for its section,
 * `repetitions_in_single_session` is omitted unless the 50 repetitions were
 * completed (VR-18 makes it structurally impossible otherwise), and
 * `read_tafsir` is sent only when answered.
 */
export function buildSubmitPayload(
  type: DailyReportType,
  v: DailyReportFormValues,
  reportDate: string,
): SubmitDailyReportPayload {
  switch (type) {
    case 'Absent':
      return {
        type: 'Absent',
        report_date: reportDate,
        absence_reason: v.absence_reason as AbsenceReason,
      };
    case 'Revision':
      return {
        type: 'Revision',
        report_date: reportDate,
        rev_range: v.rev_range as AyahRangeDto,
        rev_time: {
          from: v.rev_time.from as string,
          to: v.rev_time.to as string,
        },
      };
    case 'Normal':
      return {
        type: 'Normal',
        report_date: reportDate,
        ...(v.memoGate === 'yes' && v.memo_range
          ? {
              memo_range: v.memo_range,
              memo_time: {
                from: v.memo_time.from as string,
                to: v.memo_time.to as string,
              },
              completed_50_repetitions: v.completed_50_repetitions === true,
              ...(v.completed_50_repetitions === true
                ? {
                    repetitions_in_single_session:
                      v.repetitions_in_single_session === true,
                  }
                : {}),
            }
          : {}),
        ...(v.revGate === 'yes' && v.rev_range
          ? {
              rev_range: v.rev_range,
              rev_time: {
                from: v.rev_time.from as string,
                to: v.rev_time.to as string,
              },
            }
          : {}),
        ...(v.read_tafsir !== null ? { read_tafsir: v.read_tafsir } : {}),
      };
  }
}

/** Form fields a server `details[].field` (APIS §9.5) can be attached to. */
export const SERVER_FIELD_TO_FORM_FIELD: Record<
  string,
  keyof DailyReportFormValues
> = {
  absence_reason: 'absence_reason',
  memo_range: 'memo_range',
  memo_time: 'memo_time',
  completed_50_repetitions: 'completed_50_repetitions',
  repetitions_in_single_session: 'repetitions_in_single_session',
  rev_range: 'rev_range',
  rev_time: 'rev_time',
  read_tafsir: 'read_tafsir',
};
