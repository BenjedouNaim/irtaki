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

/** VO-01 AyahPosition as carried on the event: (surah, ayah) + ordinal. */
export interface DailyReportAyahPosition {
  surah: number;
  ayah: number;
  /** Canonical ordinal, `surahs[s].ordinal_offset + a` (SAS §17.6). */
  ordinal: number;
}

/**
 * VO-02 AyahRange as carried on the event (DMS §8, §19.2): a `start` and an
 * `end` position, `end.ordinal >= start.ordinal` (BR-52). The producer builds
 * it from a validated AyahRange; the consumer rebuilds the AyahRange from it.
 */
export interface DailyReportMemoRange {
  start: DailyReportAyahPosition;
  end: DailyReportAyahPosition;
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
