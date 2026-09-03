import React, { useMemo } from 'react';
import { ReportHistoryList } from '@/shared/components/ReportHistoryList';
import { DailyReportDto } from '@/shared/api/dailyReports.client';
import { useSurahs } from '@/features/progress/hooks/useSurahs';
import { buildSurahIndex } from '@/features/progress/utils/ayahRange';
import { useDailyReportsList } from '../hooks/useDailyReportsList';
import { DailyReportRow } from './DailyReportRow';

export interface DailyReportHistoryListProps {
  /**
   * Data source: omitted = the caller's own history (API-031, SCR-14);
   * a membership id = that student's list read as staff (API-032, SCR-25).
   */
  membershipId?: string;
  /** Row tap → SCR-15 rendered from this row (F-DR-07). */
  onOpenReport?: (report: DailyReportDto) => void;
  testID?: string;
}

/** UF §23 "Daily Reports history — No reports yet". */
const EMPTY_MESSAGE = 'لا توجد تقارير بعد';

/**
 * SCR-14 Daily sub-tab content (F-DR-05, UF §15 "Report History"): the
 * caller's own reports, `report_date DESC`, through the shared
 * `ReportHistoryList` (skeleton, inline spinner, retry banners, UF §23
 * empty state). Surah names for the row summaries come from the cached
 * reference list. This exact component is reused verbatim by SCR-25 for
 * the Teacher's raw-report view (F-DR-06) — only the data source changes,
 * via `membershipId`.
 */
export function DailyReportHistoryList({
  membershipId,
  onOpenReport,
  testID = 'daily-report-history',
}: DailyReportHistoryListProps) {
  const query = useDailyReportsList(
    membershipId ? { kind: 'membership', membershipId } : { kind: 'own' },
  );
  const { data: surahs } = useSurahs();
  const surahIndex = useMemo(() => buildSurahIndex(surahs ?? []), [surahs]);

  return (
    <ReportHistoryList
      query={query}
      renderRow={(report) => (
        <DailyReportRow
          report={report}
          surahIndex={surahIndex}
          onPress={onOpenReport}
        />
      )}
      emptyMessage={EMPTY_MESSAGE}
      emptyIcon="file-text"
      testID={testID}
    />
  );
}
