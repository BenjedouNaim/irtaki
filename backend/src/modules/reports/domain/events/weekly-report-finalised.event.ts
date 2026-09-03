/**
 * DE-07 WeeklyReportFinalised (DMS §17).
 *
 * Trigger: "Student confirms, or Scheduler defaults at midnight" — the two
 * ST-06 `Open → Finalised` transitions. Producers: `ConfirmWeeklyReportUseCase`
 * (F-WR-02, API-034) and DS-02 `WeeklyReportFinalizationService`. Emitted
 * post-commit, fire-and-forget (ADR-026, ADR-032), after the row's single
 * auto-committed UPDATE (TS §19) has returned.
 *
 * Consumers today: none subscribes yet — the Commitment Score's
 * AttendanceRate component (DS-03) reads finalised rows at request time
 * (EPIC-07); Notifications (SA §11 dashed edge) has no catalogued
 * notification for it (SAS §22.2). Named now because it is Required (DMS).
 *
 * Relevant data (DMS): membership_id, week, attended, finalised_by.
 */
export class WeeklyReportFinalisedEvent {
  static readonly EVENT_NAME = 'weekly-report.finalised';

  constructor(
    public readonly membershipId: string,
    /** VO-04 ReportingWeek: `YYYY-MM-DD` bounds, `weekEnd` the recitation day. */
    public readonly week: { weekStart: string; weekEnd: string },
    public readonly attended: boolean,
    /**
     * `users.id` of the confirming Student; `null` when the Scheduler
     * defaulted the week (DBD §14 — the nullable column is what
     * distinguishes DE-07's two trigger paths).
     */
    public readonly finalisedBy: string | null,
  ) {}
}
