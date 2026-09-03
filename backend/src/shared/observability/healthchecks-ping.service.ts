import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type HealthchecksPingResult = 'pinged' | 'unconfigured' | 'failed';

/** Outbound request budget — the ping must never hold a job tick hostage. */
const PING_TIMEOUT_MS = 5_000;

/**
 * Healthchecks.io dead-man's-switch adapter (ADR-033; TS §31 "every
 * scheduled job pings on success; a missed ping alerts"; SA §32 "Scheduled
 * job silently fails → Healthchecks.io"). Closes SAS ISS-01.
 *
 * One ping URL per job, read from `HEALTHCHECKS_PING_URL_<JOB>` (TS §32).
 * Best-effort by design: an unset variable or an unreachable Healthchecks.io
 * is logged at WARN (TS §30 "recoverable anomaly") and never surfaces to
 * the caller — the job's own outcome is what matters; the missed ping is
 * itself the alert on the Healthchecks.io side.
 */
@Injectable()
export class HealthchecksPingService {
  private readonly logger = new Logger(HealthchecksPingService.name);
  /** Keys already warned about — an unset URL is reported once, not every tick. */
  private readonly warnedUnconfigured = new Set<string>();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Signals a successful run of `jobKey` (e.g. `WEEKLY_REPORT_FINALIZATION`
   * → `HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION`).
   */
  async pingSuccess(jobKey: string): Promise<HealthchecksPingResult> {
    const variable = `HEALTHCHECKS_PING_URL_${jobKey}`;
    const url = this.configService.get<string>(variable)?.trim();

    if (!url) {
      if (!this.warnedUnconfigured.has(variable)) {
        this.warnedUnconfigured.add(variable);
        this.logger.warn(
          `Healthchecks.io ping for ${jobKey} skipped: ${variable} is not set (dead-man's-switch inactive for this job)`,
        );
      }
      return 'unconfigured';
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `Healthchecks.io ping for ${jobKey} answered HTTP ${response.status}`,
        );
        return 'failed';
      }
      return 'pinged';
    } catch (err: unknown) {
      this.logger.warn(
        `Healthchecks.io ping for ${jobKey} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 'failed';
    }
  }
}
