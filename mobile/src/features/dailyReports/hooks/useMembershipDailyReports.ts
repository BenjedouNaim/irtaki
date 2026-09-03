import { useDailyReportsList } from './useDailyReportsList';

export {
  MEMBERSHIP_DAILY_REPORTS_QUERY_KEY,
  membershipDailyReportsQueryKey,
} from './useDailyReportsList';

/**
 * Feature hook for SCR-25 Raw Daily Reports (F-DR-06): one student's report
 * list read as staff (API-032) through the shared daily-report list query —
 * same page size, cursor handling and cache semantics as SCR-14.
 */
export function useMembershipDailyReports(membershipId: string) {
  return useDailyReportsList({ kind: 'membership', membershipId });
}
