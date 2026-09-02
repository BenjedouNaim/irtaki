import React from 'react';
import { ReportTypeSelectionScreen } from '@/features/dailyReports/screens/ReportTypeSelectionScreen';

/**
 * SCR-09 Report Type Selection — Student Home → "Submit Today's Report"
 * (UF §26). Type-specific forms (SCR-10) are wired by F-DR-02.
 */
export default function ReportTypeSelectionRoute() {
  return <ReportTypeSelectionScreen />;
}
