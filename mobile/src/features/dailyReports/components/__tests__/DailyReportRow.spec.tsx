import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { DailyReportRow, describeDailyReport } from '../DailyReportRow';
import { DailyReportDto } from '@/shared/api/dailyReports.client';

const base: DailyReportDto = {
  id: 'report-1',
  report_date: '2026-08-05',
  type: 'Normal',
  submitted_at: '2026-08-05T08:30:00.000Z',
  submitted_timezone: 'Africa/Tunis',
  no_memorization_today: false,
  memo_range: { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } },
  memo_time: { from: '18:00', to: '18:45' },
  completed_50_repetitions: true,
  repetitions_in_single_session: true,
  no_revision_today: false,
  rev_range: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } },
  rev_time: { from: '19:00', to: '19:10' },
  read_tafsir: false,
  absence_reason: null,
};

describe('DailyReportRow (SCR-14 list row)', () => {
  it('renders the date, the type badge and a summary, as one 48dp+ button (UF §32)', () => {
    const onPress = jest.fn();
    render(<DailyReportRow report={base} onPress={onPress} />);

    const row = screen.getByTestId('daily-report-row-report-1');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe(
      'تقرير 2026-08-05: عادي. حفظ ومراجعة',
    );
    expect(
      screen.getByTestId('daily-report-row-report-1-date').props.children,
    ).toBe('2026-08-05');
    expect(screen.getByText('عادي')).toBeTruthy();
    expect(
      screen.getByTestId('daily-report-row-report-1-summary').props.children,
    ).toBe('حفظ ومراجعة');

    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledWith(base);
  });

  it.each<[string, Partial<DailyReportDto>, string]>([
    [
      'memorisation only',
      { rev_range: null, rev_time: null, no_revision_today: true },
      'حفظ',
    ],
    [
      'revision only',
      {
        memo_range: null,
        memo_time: null,
        no_memorization_today: true,
        completed_50_repetitions: null,
        repetitions_in_single_session: null,
      },
      'مراجعة فقط',
    ],
    [
      'neither (BR-48)',
      {
        memo_range: null,
        memo_time: null,
        rev_range: null,
        rev_time: null,
        no_memorization_today: true,
        no_revision_today: true,
        completed_50_repetitions: null,
        repetitions_in_single_session: null,
      },
      'دون حفظ أو مراجعة',
    ],
    [
      'Revision type',
      {
        type: 'Revision',
        memo_range: null,
        memo_time: null,
        completed_50_repetitions: null,
        repetitions_in_single_session: null,
        read_tafsir: null,
      },
      'مراجعة',
    ],
    [
      'Absent — Sick',
      {
        type: 'Absent',
        absence_reason: 'Sick',
        memo_range: null,
        rev_range: null,
      },
      'غياب — مرض',
    ],
    [
      'Absent — Other',
      {
        type: 'Absent',
        absence_reason: 'Other',
        memo_range: null,
        rev_range: null,
      },
      'غياب — سبب آخر',
    ],
  ])('summarises %s from the row alone', (_label, overrides, expected) => {
    expect(describeDailyReport({ ...base, ...overrides })).toBe(expected);
  });

  it('shows the Absent and Revision type labels with their badges', () => {
    render(
      <DailyReportRow
        report={{
          ...base,
          id: 'a',
          type: 'Absent',
          absence_reason: 'Studying',
        }}
      />,
    );
    expect(screen.getByTestId('daily-report-row-a-type')).toBeTruthy();
    expect(screen.getByText('غياب')).toBeTruthy();
    expect(screen.getByText('غياب — دراسة')).toBeTruthy();
  });
});
