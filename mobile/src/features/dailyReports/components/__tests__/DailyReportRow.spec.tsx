import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  DailyReportRow,
  dailyReportBadge,
  describeDailyReport,
} from '../DailyReportRow';
import { DailyReportDto } from '@/shared/api/dailyReports.client';
import { buildSurahIndex } from '@/features/progress/utils/ayahRange';

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

const surahIndex = buildSurahIndex([
  { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
  { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
]);

describe('DailyReportRow (SCR-14 list row, Figma 31:782)', () => {
  it('renders the Arabic day, the type badge and a named-range summary, as one 48dp+ button (UF §32)', () => {
    const onPress = jest.fn();
    render(
      <DailyReportRow
        report={base}
        surahIndex={surahIndex}
        onPress={onPress}
      />,
    );

    const row = screen.getByTestId('daily-report-row-report-1');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe(
      'تقرير الأربعاء 5 أوت: عادي. حفظ: البقرة 1 ← 20 · مراجعة: الفاتحة 1 ← 7',
    );
    expect(
      screen.getByTestId('daily-report-row-report-1-date').props.children,
    ).toBe('الأربعاء 5 أوت');
    expect(screen.getByText('عادي')).toBeTruthy();
    expect(
      screen.getByTestId('daily-report-row-report-1-summary').props.children,
    ).toBe('حفظ: البقرة 1 ← 20 · مراجعة: الفاتحة 1 ← 7');

    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledWith(base);
  });

  it('falls back to surah numbers while the reference data is unavailable', () => {
    expect(describeDailyReport(base)).toBe(
      'حفظ: سورة 2 1 ← 20 · مراجعة: سورة 1 1 ← 7',
    );
  });

  it.each<[string, Partial<DailyReportDto>, string]>([
    [
      'memorisation only',
      { rev_range: null, rev_time: null, no_revision_today: true },
      'حفظ: البقرة 1 ← 20 · بدون مراجعة',
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
      'بدون حفظ · مراجعة: الفاتحة 1 ← 7',
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
      'مراجعة: الفاتحة 1 ← 7',
    ],
    [
      'Absent — Sick',
      {
        type: 'Absent',
        absence_reason: 'Sick',
        memo_range: null,
        rev_range: null,
      },
      'غياب — مريض',
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
    expect(describeDailyReport({ ...base, ...overrides }, surahIndex)).toBe(
      expected,
    );
  });

  it('badges an excused absence as "غياب بعذر" and an Other absence as "يوم فائت" (BR-24/BR-25)', () => {
    render(
      <DailyReportRow
        report={{
          ...base,
          id: 'a',
          type: 'Absent',
          absence_reason: 'Studying',
        }}
        surahIndex={surahIndex}
      />,
    );
    expect(screen.getByTestId('daily-report-row-a-type')).toBeTruthy();
    expect(screen.getByText('غياب بعذر')).toBeTruthy();
    expect(screen.getByText('غياب — دراسة')).toBeTruthy();

    expect(
      dailyReportBadge({ ...base, type: 'Absent', absence_reason: 'Other' }),
    ).toEqual({ label: 'يوم فائت', variant: 'error' });
    expect(dailyReportBadge({ ...base, type: 'Revision' })).toEqual({
      label: 'مراجعة',
      variant: 'info',
    });
  });
});
