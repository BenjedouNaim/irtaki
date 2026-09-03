import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WeeklyReportFinalisedEvent } from '../../domain/events/weekly-report-finalised.event';
import { hasRecitationDayPassed } from '../../domain/weekly-report-finalisation';
import {
  type IWeeklyReportRepository,
  WEEKLY_REPORT_REPOSITORY,
} from '../../domain/weekly-report.repository.interface';

/** One run's outcome, for the job's INFO log line (TS §30/§31). */
export interface WeeklyReportFinalizationOutcome {
  /** Live `Open` rows examined. */
  candidates: number;
  /** Rows this run transitioned `Open → Finalised` with `attended = false`. */
  finalised: number;
}

/**
 * DS-02 WeeklyReportFinalizationService (DMS §16): "Scheduler-driven:
 * finalizes any `Open` WeeklyReport whose recitation day has passed,
 * defaulting `attended = false`" — the FR-WR-06 / AC-12 fallback for a
 * Student who never confirmed (UC-06 5a, ST-06 Scheduler path). Distinct
 * from `ConfirmWeeklyReportUseCase`, the Student path; both emit DE-07.
 *
 * "Recitation day has passed" is evaluated per row against the holder's
 * `users.timezone` (T-01, INV-27; ADR-030 "filtering by each user's
 * computed local time"): the local calendar date is strictly after
 * `week_end`. Every overdue row qualifies, however old — a missed tick is
 * caught up on the next run (SAS §19.6, EC-24/EC-39) — and the UPDATE is
 * guarded by `state = 'Open'`, so a re-run rewrites nothing (VR-36, AR-17,
 * EC-40) and a Student confirming concurrently wins. Idempotent, safe to
 * re-run at any time. Orchestrates the repository from the application
 * layer (TS §9): the predicate itself is a pure domain rule.
 *
 * `now` is injectable so tests drive the clock (Development Plan EPIC-08
 * acceptance: scheduler-evaluator tests across distinct timezones).
 */
@Injectable()
export class WeeklyReportFinalizationService {
  constructor(
    @Inject(WEEKLY_REPORT_REPOSITORY)
    private readonly weeklyReportRepository: IWeeklyReportRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async finaliseOverdue(
    now: Date = new Date(),
  ): Promise<WeeklyReportFinalizationOutcome> {
    const open = await this.weeklyReportRepository.findAllOpenWithTimezone();
    const overdueIds = open
      .filter((row) => hasRecitationDayPassed(row.weekEnd, now, row.timezone))
      .map((row) => row.id);

    const finalised = await this.weeklyReportRepository.finaliseAsScheduler(
      overdueIds,
      now,
    );

    for (const row of finalised) {
      // DE-07, post-commit, fire-and-forget (ADR-026/032); `finalisedBy`
      // is null — the scheduler-default marker (DBD §14).
      try {
        this.eventEmitter.emit(
          WeeklyReportFinalisedEvent.EVENT_NAME,
          new WeeklyReportFinalisedEvent(
            row.membershipId,
            { weekStart: row.weekStart, weekEnd: row.weekEnd },
            row.attendedRecitationCall,
            row.finalisedBy,
          ),
        );
      } catch {
        // A listener failure must never fail the finalisation (ADR-032).
      }
    }

    return { candidates: open.length, finalised: finalised.length };
  }
}
