import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { WeeklyReportDto } from '@/shared/api/weeklyReports.client';
import {
  WeeklyReportRow,
  describeWeekRange,
  describeWeeklyReport,
} from '../WeeklyReportRow';

function report(overrides: Partial<WeeklyReportDto> = {}): WeeklyReportDto {
  return {
    id: 'w1',
    week_start: '2026-08-15',
    week_end: '2026-08-21',
    expected_days: 6,
    missed_daily_reports: 2,
    missed_daily_memorization: 3,
    missed_daily_revision: 4,
    missed_50_repetitions: 5,
    missed_single_session: 6,
    attended_recitation_call: true,
    state: 'Finalised',
    finalised_at: '2026-08-21T09:00:00.000Z',
    finalised_by: 'Student',
    ...overrides,
  };
}

describe('WeeklyReportRow (SCR-14 Weekly sub-tab list row, F-WR-03)', () => {
  it('shows the week range, a factual summary from the stored counts and the attendance badge', () => {
    render(<WeeklyReportRow report={report()} />);

    expect(
      screen.getByTestId('weekly-report-row-w1-range').props.children,
    ).toBe('من 2026-08-15 إلى 2026-08-21');
    expect(
      screen.getByTestId('weekly-report-row-w1-summary').props.children,
    ).toBe('التقارير اليومية الفائتة: 2 من 6');
    expect(screen.getByText('حضر جلسة التسميع')).toBeTruthy();
  });

  it('states a missed recitation call as text, never colour alone (UF §32)', () => {
    render(
      <WeeklyReportRow
        report={report({
          attended_recitation_call: false,
          finalised_by: 'Scheduler',
        })}
      />,
    );

    expect(screen.getByText('لم يحضر جلسة التسميع')).toBeTruthy();
    expect(screen.queryByText('حضر جلسة التسميع')).toBeNull();
  });

  it('is one 48dp+ button carrying the whole summary as its label and hands the row back on tap', () => {
    const onPress = jest.fn();
    render(<WeeklyReportRow report={report()} onPress={onPress} />);

    const row = screen.getByTestId('weekly-report-row-w1');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe(
      'تقرير الأسبوع من 2026-08-15 إلى 2026-08-21: حضر جلسة التسميع. التقارير اليومية الفائتة: 2 من 6',
    );

    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledWith(report());
  });

  it('exposes the helpers used by the row', () => {
    expect(describeWeekRange(report())).toBe('من 2026-08-15 إلى 2026-08-21');
    expect(describeWeeklyReport(report({ missed_daily_reports: 0 }))).toBe(
      'التقارير اليومية الفائتة: 0 من 6',
    );
  });
});
