import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DailyReportSubmittedEvent } from '../../../reports/domain/events/daily-report-submitted.event';
import { UpdateCoverageUseCase } from './update-coverage.use-case';

/**
 * DE-05 DailyReportSubmitted → DS-05 subscription (SA §11 dashed edge
 * Reports → Progress).
 *
 * Registered now, dormant until EPIC-05's SubmitDailyReportUseCase emits the
 * event — same posture as DE-10 GroupArchived, which is emitted today with no
 * subscriber yet. Runs fire-and-forget with its own try/catch (ADR-032): a
 * failure here never surfaces to the report submitter; the nightly
 * CoverageReconciliationJob (ADR-029) repairs any drift.
 */
@Injectable()
export class DailyReportSubmittedListener {
  private readonly logger = new Logger(DailyReportSubmittedListener.name);

  constructor(private readonly updateCoverageUseCase: UpdateCoverageUseCase) {}

  @OnEvent(DailyReportSubmittedEvent.EVENT_NAME, {
    async: true,
    promisify: true,
  })
  async handle(event: DailyReportSubmittedEvent): Promise<void> {
    try {
      await this.updateCoverageUseCase.execute(event);
    } catch (err: unknown) {
      // String-first, like every other logger call (TS §30 Pino bridge):
      // the message carries the context, the stack rides as the second
      // argument.
      this.logger.error(
        `DS-05 coverage update failed for membership ${event?.membershipId} on ${event?.reportDate}; left for CoverageReconciliationJob (ADR-029): ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
