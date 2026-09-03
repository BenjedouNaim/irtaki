import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DailyReportDto,
  submitDailyReport,
  SubmitDailyReportPayload,
  SubmitDailyReportResultDto,
} from '@/shared/api/dailyReports.client';
import { ApiError } from '@/shared/api/types';
import { MY_PROGRESS_QUERY_KEY } from '@/features/progress/hooks/useMyProgress';
import { CURRENT_WEEKLY_REPORT_QUERY_KEY } from '@/features/weeklyReports/hooks/useCurrentWeeklyReport';
import { TODAY_REPORT_STATUS_QUERY_KEY } from './useTodayReportStatus';
import { OWN_DAILY_REPORTS_QUERY_KEY } from './useOwnDailyReports';

/**
 * Query keys a successful submission invalidates (TS §26): today's status
 * (Home CTA flips to "View Today's Report"), own history, the live weekly
 * view (API-033 is computed on read, so a new report changes it) and the
 * performance view, and own progress (`ahzab_completed` changed, UF §15).
 * Declared once here — the single source of truth for "what this write
 * affects".
 */
export const SUBMIT_DAILY_REPORT_INVALIDATES = [
  TODAY_REPORT_STATUS_QUERY_KEY,
  OWN_DAILY_REPORTS_QUERY_KEY,
  CURRENT_WEEKLY_REPORT_QUERY_KEY,
  ['performance', 'mine'],
  MY_PROGRESS_QUERY_KEY,
] as const;

/**
 * Outcome of one submission. A `409 DUPLICATE_REPORT` is NOT an error
 * (UF §15 / §36: "silent success — existing report returned, treated as
 * 201"; TS §28): the mutation resolves with the server's existing report.
 */
export type SubmitDailyReportOutcome =
  | { kind: 'created'; result: SubmitDailyReportResultDto }
  | { kind: 'duplicate'; existingReport: DailyReportDto | null };

async function submitOrAcceptDuplicate(
  payload: SubmitDailyReportPayload,
): Promise<SubmitDailyReportOutcome> {
  try {
    const result = await submitDailyReport(payload);
    return { kind: 'created', result };
  } catch (err: unknown) {
    if (
      err instanceof ApiError &&
      err.statusCode === 409 &&
      err.errorCode === 'DUPLICATE_REPORT'
    ) {
      return {
        kind: 'duplicate',
        existingReport:
          (err.existingReport as DailyReportDto | undefined) ?? null,
      };
    }
    throw err;
  }
}

/**
 * Feature hook for submitting today's report (F-DR-02, SCR-10, API-030).
 * TanStack mutation per TS §26 — screens never call the API client directly.
 * Every other error (`422`, `403`, `5xx`, network) is surfaced unchanged for
 * the screen to map per UF §15's submission-state table.
 */
export function useSubmitDailyReport() {
  const queryClient = useQueryClient();
  return useMutation<SubmitDailyReportOutcome, Error, SubmitDailyReportPayload>(
    {
      mutationFn: submitOrAcceptDuplicate,
      onSuccess: async () => {
        await Promise.all(
          SUBMIT_DAILY_REPORT_INVALIDATES.map((queryKey) =>
            queryClient.invalidateQueries({ queryKey: [...queryKey] }),
          ),
        );
      },
    },
  );
}
