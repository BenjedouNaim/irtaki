import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportDetailScreen } from '../ReportDetailScreen';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import { apiClient } from '@/shared/api/client';

// F-DR-07 acceptance: "no new network call made". Every transport is a
// mock that fails loudly if touched.
jest.mock('@/shared/api/client', () => ({
  apiClient: {
    get: jest.fn(() => {
      throw new Error('unexpected GET');
    }),
    post: jest.fn(() => {
      throw new Error('unexpected POST');
    }),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock('@/shared/api/dailyReports.client');
jest.mock('@/features/progress/hooks/useSurahs', () => ({
  useSurahs: () => ({
    data: [
      { number: 1, name_ar: 'الفاتحة', ayah_count: 7, ordinal_offset: 0 },
      { number: 2, name_ar: 'البقرة', ayah_count: 286, ordinal_offset: 7 },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

const fullNormal: dailyReportsApi.DailyReportDto = {
  id: 'report-1',
  report_date: '2026-08-05',
  type: 'Normal',
  submitted_at: '2026-08-05T08:30:00.000Z',
  submitted_timezone: 'Africa/Tunis',
  no_memorization_today: false,
  memo_range: { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } },
  memo_time: { from: '18:00', to: '18:45' },
  completed_50_repetitions: true,
  repetitions_in_single_session: false,
  no_revision_today: false,
  rev_range: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } },
  rev_time: { from: '19:00', to: '19:10' },
  read_tafsir: true,
  absence_reason: null,
};

const bareNormal: dailyReportsApi.DailyReportDto = {
  ...fullNormal,
  id: 'report-2',
  no_memorization_today: true,
  memo_range: null,
  memo_time: null,
  completed_50_repetitions: null,
  repetitions_in_single_session: null,
  no_revision_today: true,
  rev_range: null,
  rev_time: null,
  read_tafsir: null,
};

const absent: dailyReportsApi.DailyReportDto = {
  ...bareNormal,
  id: 'report-3',
  type: 'Absent',
  no_memorization_today: null,
  no_revision_today: null,
  absence_reason: 'Other',
};

const revision: dailyReportsApi.DailyReportDto = {
  ...bareNormal,
  id: 'report-4',
  type: 'Revision',
  no_memorization_today: null,
  no_revision_today: false,
  rev_range: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } },
  rev_time: { from: '19:00', to: '19:10' },
};

let queryClient: QueryClient;

function renderScreen(report: dailyReportsApi.DailyReportDto) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportDetailScreen report={report} />
    </QueryClientProvider>,
  );
}

function isDisabled(testID: string): boolean {
  return Boolean(screen.getByTestId(testID).props.accessibilityState?.disabled);
}

function isSelected(testID: string): boolean {
  return Boolean(screen.getByTestId(testID).props.accessibilityState?.selected);
}

function expectNoNetworkCall() {
  expect(apiClient.get).not.toHaveBeenCalled();
  expect(apiClient.post).not.toHaveBeenCalled();
  expect(dailyReportsApi.listOwnDailyReports).not.toHaveBeenCalled();
  expect(dailyReportsApi.getTodayReportStatus).not.toHaveBeenCalled();
  expect(dailyReportsApi.submitDailyReport).not.toHaveBeenCalled();
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
}

describe('ReportDetailScreen (SCR-15, F-DR-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders a full Normal report in the SCR-10 layout with every field disabled and no submit', () => {
    renderScreen(fullNormal);

    expect(screen.getByTestId('report-detail-title').props.children).toBe(
      'تقرير عادي',
    );
    expect(screen.getByTestId('report-detail-date').props.children).toBe(
      'تقرير يوم 2026-08-05',
    );
    expect(screen.getByTestId('memo-section')).toBeTruthy();
    expect(screen.getByTestId('rev-section')).toBeTruthy();
    expect(screen.getByTestId('tafsir-section')).toBeTruthy();

    // Section A reflects the row: gate Yes, range, time, 50 reps Yes, single session No.
    expect(isSelected('memo-gate-yes')).toBe(true);
    expect(screen.getByTestId('memo-details')).toBeTruthy();
    expect(screen.getByTestId('memo-range-field-summary').props.children).toBe(
      'من سورة البقرة آية 1 إلى سورة البقرة آية 20',
    );
    expect(
      screen.getByTestId('memo-time-field-from-value').props.children,
    ).toBe('18:00');
    expect(screen.getByTestId('memo-time-field-to-value').props.children).toBe(
      '18:45',
    );
    expect(isSelected('completed-50-toggle-yes')).toBe(true);
    expect(isSelected('single-session-toggle-no')).toBe(true);

    // Section B and tafsir.
    expect(isSelected('rev-gate-yes')).toBe(true);
    expect(screen.getByTestId('rev-details')).toBeTruthy();
    expect(screen.getByTestId('rev-range-field-summary').props.children).toBe(
      'من سورة الفاتحة آية 1 إلى سورة الفاتحة آية 7',
    );
    expect(isSelected('read-tafsir-toggle-yes')).toBe(true);

    // All fields disabled (UF §28 "all fields disabled").
    for (const id of [
      'memo-gate-yes',
      'memo-gate-no',
      'memo-range-field-trigger',
      'memo-time-field-from',
      'memo-time-field-to',
      'completed-50-toggle-yes',
      'single-session-toggle-no',
      'rev-gate-yes',
      'rev-range-field-trigger',
      'rev-time-field-from',
      'read-tafsir-toggle-yes',
    ]) {
      expect(isDisabled(id)).toBe(true);
    }

    // Read-only: no submit, no discard dialog, no error banner.
    expect(screen.queryByTestId('submit-report-button')).toBeNull();
    expect(screen.queryByTestId('discard-report-dialog')).toBeNull();
    expect(screen.queryByTestId('daily-report-form-banner')).toBeNull();
    expectNoNetworkCall();
  });

  it('disabled fields ignore taps — the row is immutable (BR-22)', () => {
    renderScreen(fullNormal);

    fireEvent.press(screen.getByTestId('memo-gate-no'));
    fireEvent.press(screen.getByTestId('memo-range-field-trigger'));
    fireEvent.press(screen.getByTestId('memo-time-field-from'));

    expect(isSelected('memo-gate-yes')).toBe(true);
    expect(isSelected('memo-gate-no')).toBe(false);
    expect(screen.getByTestId('memo-details')).toBeTruthy();
    expect(screen.queryByTestId('memo-range-field-sheet')).toBeNull();
    expectNoNetworkCall();
  });

  it('renders a Normal report with neither section (BR-48): both gates No, no details, tafsir unanswered', () => {
    renderScreen(bareNormal);

    expect(isSelected('memo-gate-no')).toBe(true);
    expect(isSelected('rev-gate-no')).toBe(true);
    expect(screen.queryByTestId('memo-details')).toBeNull();
    expect(screen.queryByTestId('rev-details')).toBeNull();
    expect(screen.queryByTestId('single-session-toggle')).toBeNull();
    expect(isSelected('read-tafsir-toggle-yes')).toBe(false);
    expect(isSelected('read-tafsir-toggle-no')).toBe(false);
    expectNoNetworkCall();
  });

  it('renders an Absent report as the disabled reason picker only', () => {
    renderScreen(absent);

    expect(screen.getByTestId('report-detail-title').props.children).toBe(
      'تقرير غياب',
    );
    expect(screen.getByTestId('absence-reason-picker')).toBeTruthy();
    expect(isSelected('absence-reason-picker-other')).toBe(true);
    expect(isDisabled('absence-reason-picker-other')).toBe(true);
    expect(isDisabled('absence-reason-picker-sick')).toBe(true);
    expect(screen.queryByTestId('memo-section')).toBeNull();
    expect(screen.queryByTestId('rev-section')).toBeNull();
    expect(screen.queryByTestId('tafsir-section')).toBeNull();
    expect(screen.queryByTestId('submit-report-button')).toBeNull();

    fireEvent.press(screen.getByTestId('absence-reason-picker-sick'));
    expect(isSelected('absence-reason-picker-other')).toBe(true);
    expectNoNetworkCall();
  });

  it('renders a Revision report as disabled range + time with no gate, memorisation or tafsir fields', () => {
    renderScreen(revision);

    expect(screen.getByTestId('report-detail-title').props.children).toBe(
      'تقرير مراجعة',
    );
    expect(screen.getByTestId('rev-range-field-summary').props.children).toBe(
      'من سورة الفاتحة آية 1 إلى سورة الفاتحة آية 7',
    );
    expect(screen.getByTestId('rev-time-field-from-value').props.children).toBe(
      '19:00',
    );
    expect(isDisabled('rev-range-field-trigger')).toBe(true);
    expect(isDisabled('rev-time-field-to')).toBe(true);
    expect(screen.queryByTestId('rev-gate')).toBeNull();
    expect(screen.queryByTestId('memo-section')).toBeNull();
    expect(screen.queryByTestId('read-tafsir-toggle')).toBeNull();
    expect(screen.queryByTestId('submit-report-button')).toBeNull();
    expectNoNetworkCall();
  });

  it('goes back from the top-right control (UF §31)', () => {
    renderScreen(absent);
    fireEvent.press(screen.getByTestId('report-detail-back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('falls back to Home when there is no history', () => {
    mockCanGoBack.mockReturnValue(false);
    renderScreen(absent);
    fireEvent.press(screen.getByTestId('report-detail-back-button'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/student');
  });
});
