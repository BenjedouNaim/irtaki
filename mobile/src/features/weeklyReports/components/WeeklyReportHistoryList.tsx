import React from 'react';
import { ReportHistoryList } from '@/shared/components/ReportHistoryList';
import { WeeklyReportDto } from '@/shared/api/weeklyReports.client';
import { useOwnWeeklyReports } from '../hooks/useOwnWeeklyReports';
import { WeeklyReportRow } from './WeeklyReportRow';

export interface WeeklyReportHistoryListProps {
  /** Row tap → the read-only weekly detail rendered from this row. */
  onOpenReport?: (report: WeeklyReportDto) => void;
  testID?: string;
}

/** UF §23 "Weekly Reports history — No weekly reports yet". */
const EMPTY_MESSAGE = 'لا توجد تقارير أسبوعية بعد';

/**
 * SCR-14 Weekly sub-tab content (F-WR-03, UF §15 "Report History"): the
 * caller's own finalised weeks (API-035), `week_start DESC`, through the
 * shared `ReportHistoryList` — the same skeleton, inline spinner, retry
 * banners and infinite scroll as the Daily sub-tab (UF §22/§24), with the
 * UF §23 weekly empty state.
 */
export function WeeklyReportHistoryList({
  onOpenReport,
  testID = 'weekly-report-history',
}: WeeklyReportHistoryListProps) {
  const query = useOwnWeeklyReports();

  return (
    <ReportHistoryList
      query={query}
      renderRow={(report) => (
        <WeeklyReportRow report={report} onPress={onOpenReport} />
      )}
      emptyMessage={EMPTY_MESSAGE}
      testID={testID}
    />
  );
}
