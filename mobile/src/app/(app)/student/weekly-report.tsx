import React from 'react';
import { WeeklyReportScreen } from '@/features/weeklyReports/screens/WeeklyReportScreen';

/**
 * SCR-12 Weekly Report — Home CTA on the recitation day (UF §26), and the
 * SCR-10 `422 RECITATION_DAY` redirect (UF §15). Reads API-033 and confirms
 * through API-034 (F-WR-01 / F-WR-02).
 */
export default function WeeklyReportRoute() {
  return <WeeklyReportScreen />;
}
