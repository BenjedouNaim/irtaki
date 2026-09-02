/**
 * DE-05 DailyReportSubmitted (DMS §17).
 *
 * Producer: `SubmitDailyReportUseCase` (F-DR-02) — emitted post-commit,
 * fire-and-forget (ADR-026, ADR-032), after the report row has been inserted.
 *
 * Consumers: day classification / reminder suppression (FR-NOTIF-03) in later
 * epics. NOT the coverage merge: DS-05 is invoked synchronously by the
 * producer through the Progress module's `UpdateCoverageUseCase` (so the
 * API-030 `201` carries the post-submission `ahzab_completed`). A listener
 * that merged `memoRange` on this event would double-merge — none exists and
 * none must be added.
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
