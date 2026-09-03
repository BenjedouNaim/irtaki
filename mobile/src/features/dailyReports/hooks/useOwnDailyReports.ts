import {
  DAILY_REPORTS_PAGE_SIZE,
  useDailyReportsList,
} from './useDailyReportsList';

export {
  OWN_DAILY_REPORTS_QUERY_KEY,
  ownDailyReportsQueryKey,
} from './useDailyReportsList';

/** UF §15 Report History: "Cursor-paginated infinite scroll (`limit=20`)". */
export const OWN_DAILY_REPORTS_PAGE_SIZE = DAILY_REPORTS_PAGE_SIZE;

/**
 * Feature hook for SCR-14's Daily sub-tab (F-DR-05): the caller's own
 * history (API-031) through the shared daily-report list query.
 */
export function useOwnDailyReports() {
  return useDailyReportsList({ kind: 'own' });
}
