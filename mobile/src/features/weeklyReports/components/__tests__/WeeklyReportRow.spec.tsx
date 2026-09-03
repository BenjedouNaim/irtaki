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

describe('WeeklyReportRow (SCR-14 Weekly sub-tab list row, F-WR-03, Figma 31:892)', () => {
  it('shows the week range, a factual summary from the stored counts and the finalisation badge', () => {
    render(<WeeklyReportRow report={report()} />);

    expect(
      screen.getByTestId('weekly-report-row-w1-range').props.children,
    ).toBe('أسبوع 15 — 21 أوت');
    expect(
      screen.getByTestId('weekly-report-row-w1-summary').props.children,
    ).toBe('فائت: تقريران · 4 مراجعة · حضر التسميع');
    expect(screen.getByText('مؤكَّد')).toBeTruthy();
  });

  it('states a missed recitation call as text, never colour alone (UF §32), and a scheduler close as "أُغلق تلقائيًا"', () => {
    render(
      <WeeklyReportRow
        report={report({
          attended_recitation_call: false,
          finalised_by: 'Scheduler',
        })}
      />,
    );

    expect(
      screen.getByTestId('weekly-report-row-w1-summary').props.children,
    ).toBe('فائت: تقريران · 4 مراجعة · لم يحضر');
    expect(screen.getByText('أُغلق تلقائيًا')).toBeTruthy();
    expect(screen.queryByText('مؤكَّد')).toBeNull();
  });

  it('is one 48dp+ button carrying the whole summary as its label and hands the row back on tap', () => {
    const onPress = jest.fn();
    render(<WeeklyReportRow report={report()} onPress={onPress} />);

    const row = screen.getByTestId('weekly-report-row-w1');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe(
      'أسبوع 15 — 21 أوت: مؤكَّد. فائت: تقريران · 4 مراجعة · حضر التسميع',
    );

    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledWith(report());
  });

  it('exposes the helpers used by the row — no arithmetic, the stored counts only', () => {
    expect(describeWeekRange(report())).toBe('أسبوع 15 — 21 أوت');
    expect(
      describeWeekRange(
        report({ week_start: '2026-08-28', week_end: '2026-09-03' }),
      ),
    ).toBe('أسبوع 28 أوت — 3 سبتمبر');
    expect(
      describeWeeklyReport(
        report({ missed_daily_reports: 0, missed_daily_revision: 0 }),
      ),
    ).toBe('فائت: 0 · حضر التسميع');
    expect(
      describeWeeklyReport(
        report({ missed_daily_reports: 1, missed_daily_revision: 2 }),
      ),
    ).toBe('فائت: 1 تقرير · 2 مراجعة · حضر التسميع');
    expect(
      describeWeeklyReport(
        report({
          missed_daily_reports: 3,
          missed_daily_revision: 0,
          attended_recitation_call: false,
        }),
      ),
    ).toBe('فائت: 3 تقارير · لم يحضر');
  });
});
