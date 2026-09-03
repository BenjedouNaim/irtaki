import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  confirmWeeklyReport,
  ConfirmWeeklyReportPayload,
  WeeklyReportDto,
} from '@/shared/api/weeklyReports.client';
import { ApiError } from '@/shared/api/types';
import { CURRENT_WEEKLY_REPORT_QUERY_KEY } from './useCurrentWeeklyReport';

/**
 * Query key of the Student's own weekly history (API-035, F-WR-03,
 * SCR-14) — declared here ahead of its hook so the confirm mutation already
 * refreshes it: a finalised week "appears in History" (UF §16).
 */
export const OWN_WEEKLY_REPORTS_QUERY_KEY = ['weekly-reports', 'mine'] as const;

/**
 * Query keys a finalisation invalidates (TS §26 — declared once, the single
 * source of truth for "what this write affects"): the current-week view
 * (API-033 now serves the finalised row, `can_confirm=false`), own weekly
 * history (UF §16 "appears in History") and own performance (DE-07 "feeds
 * Commitment Score's AttendanceRate component").
 */
export const CONFIRM_WEEKLY_REPORT_INVALIDATES = [
  CURRENT_WEEKLY_REPORT_QUERY_KEY,
  OWN_WEEKLY_REPORTS_QUERY_KEY,
  ['performance', 'mine'],
] as const;

export interface ConfirmWeeklyReportVariables extends ConfirmWeeklyReportPayload {
  reportId: string;
}

/**
 * Outcome of one confirmation. A `409 ALREADY_FINALISED` is NOT an error
 * (UF §16: "Scheduler beat the student — shows the finalized result
 * read-only, quiet note, no error tone"): the mutation resolves so the
 * screen can re-read the finalised row through the invalidated query.
 */
export type ConfirmWeeklyReportOutcome =
  | { kind: 'finalised'; report: WeeklyReportDto }
  | { kind: 'already_finalised' };

async function confirmOrAcceptFinalised(
  variables: ConfirmWeeklyReportVariables,
): Promise<ConfirmWeeklyReportOutcome> {
  try {
    const report = await confirmWeeklyReport(variables.reportId, {
      attended_recitation_call: variables.attended_recitation_call,
    });
    return { kind: 'finalised', report };
  } catch (err: unknown) {
    if (
      err instanceof ApiError &&
      err.statusCode === 409 &&
      err.errorCode === 'ALREADY_FINALISED'
    ) {
      return { kind: 'already_finalised' };
    }
    throw err;
  }
}

/**
 * Feature hook for confirming the week (F-WR-02, SCR-12, API-034). TanStack
 * mutation per TS §26 — screens never call the API client directly. Every
 * other error (`422 NOT_RECITATION_DAY`, `403`, `5xx`, network) is surfaced
 * unchanged for the screen to map per UF §16's state table.
 */
export function useConfirmWeeklyReport() {
  const queryClient = useQueryClient();
  return useMutation<
    ConfirmWeeklyReportOutcome,
    Error,
    ConfirmWeeklyReportVariables
  >({
    mutationFn: confirmOrAcceptFinalised,
    onSuccess: async () => {
      await Promise.all(
        CONFIRM_WEEKLY_REPORT_INVALIDATES.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] }),
        ),
      );
    },
  });
}
