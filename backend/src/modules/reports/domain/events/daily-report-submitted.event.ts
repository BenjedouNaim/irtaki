/**
 * DE-05 DailyReportSubmitted (DMS §17).
 *
 * Producer: DailyReport creation in the Reports module (EPIC-05,
 * SubmitDailyReportUseCase) — emitted post-commit, fire-and-forget (ADR-026,
 * ADR-032). Consumers: DS-05 coverage update when a memorisation range is
 * present (Progress module); day classification.
 *
 * Nothing emits this event until EPIC-05 lands; the Progress listener is
 * registered ahead of time and stays dormant.
 */
export interface DailyReportMemoRange {
  /** Canonical ordinal of the range start (daily_reports.memo_from_ordinal). */
  fromOrdinal: number;
  /** Canonical ordinal of the range end (daily_reports.memo_to_ordinal). */
  toOrdinal: number;
}

export type DailyReportType = 'Normal' | 'Absent' | 'Revision';

export class DailyReportSubmittedEvent {
  static readonly EVENT_NAME = 'daily-report.submitted';

  constructor(
    public readonly membershipId: string,
    /** Report date as YYYY-MM-DD. */
    public readonly reportDate: string,
    public readonly type: DailyReportType,
    /** Present only when the report carries a memorisation range. */
    public readonly memoRange: DailyReportMemoRange | null,
  ) {}
}
