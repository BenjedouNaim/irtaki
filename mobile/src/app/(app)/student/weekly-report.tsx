import React from 'react';
import { WeeklyReportScreen } from '@/features/weeklyReports/screens/WeeklyReportScreen';

/**
 * SCR-12 Weekly Report — Home CTA on the recitation day (UF §26), and the
 * SCR-10 `422 RECITATION_DAY` redirect (UF §15). The confirm action
 * (API-034) is F-WR-02's; until it lands the CTA renders disabled.
 */
export default function WeeklyReportRoute() {
  return <WeeklyReportScreen />;
}
