import { addDays } from '../../../reports/domain/local-date';

/**
 * ISS-17's "once per cycle / once per episode" guard needs an INSTANT to
 * ask `notification_log` about, and every boundary the domain knows is a
 * calendar date in the student's timezone. This converts one to the other
 * by taking UTC midnight of that date.
 *
 * The conversion is deliberately coarse — it can be up to fourteen hours
 * either side of the true local boundary — and both callers are built to
 * tolerate exactly that: see `AT_RISK_EPISODE_ANCHOR_OFFSET_DAYS` below,
 * and the payment cycle, whose boundaries are three months apart.
 */
export function utcInstantOfDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/**
 * Where an at-risk episode's dedup window opens, measured from the newest
 * live report (or, when there is none, from the membership's start).
 *
 * Two days, because that is the only offset both halves of the guard can
 * live with. DS-04 needs **three** expected days with no report before the
 * predicate holds, so:
 *
 * - a notification belonging to THIS episode cannot land earlier than three
 *   calendar days after the anchor date, comfortably after the window opens
 *   — so the guard never hides an episode's own first notification; and
 * - a notification belonging to the PREVIOUS episode cannot land later than
 *   the end of the anchor date itself (the report that ended it is dated
 *   then), comfortably before the window opens — so the guard never lets a
 *   stale notification suppress a fresh episode.
 *
 * Any timezone offset is at most fourteen hours and cannot cross either
 * margin.
 */
export const AT_RISK_EPISODE_ANCHOR_OFFSET_DAYS = 2;

/** The instant an at-risk episode's `notification_log` window opens. */
export function atRiskEpisodeWindowStart(
  lastReportDate: string | null,
  startedAt: string,
): Date {
  return utcInstantOfDate(
    addDays(lastReportDate ?? startedAt, AT_RISK_EPISODE_ANCHOR_OFFSET_DAYS),
  );
}
