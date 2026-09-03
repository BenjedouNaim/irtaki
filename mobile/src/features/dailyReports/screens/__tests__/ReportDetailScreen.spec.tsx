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

function value(testID: string): unknown {
  return screen.getByTestId(`${testID}-value`).props.children;
}

function expectNoNetworkCall() {
  expect(apiClient.get).not.toHaveBeenCalled();
  expect(apiClient.post).not.toHaveBeenCalled();
  expect(dailyReportsApi.listOwnDailyReports).not.toHaveBeenCalled();
  expect(dailyReportsApi.getTodayReportStatus).not.toHaveBeenCalled();
  expect(dailyReportsApi.submitDailyReport).not.toHaveBeenCalled();
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
}

describe('ReportDetailScreen (SCR-15, F-DR-07, Figma 31:981)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders a full Normal report as read-only rows per SCR-10 section, with no submit', () => {
    renderScreen(fullNormal);

    expect(screen.getByTestId('report-detail-title').props.children).toBe(
      'تقرير الأربعاء 5 أوت',
    );
    expect(screen.getByText('عادي')).toBeTruthy();
    expect(screen.getByTestId('report-detail-date').props.children).toMatch(
      /^أُرسل في \d{2}:\d{2}$/,
    );
    expect(
      screen.getByTestId('report-detail-note-message').props.children,
    ).toBe('التقارير المرسلة نهائية — لا تعديل ولا حذف.');
    expect(screen.getByTestId('memo-section')).toBeTruthy();
    expect(screen.getByTestId('rev-section')).toBeTruthy();
    expect(screen.getByTestId('tafsir-section')).toBeTruthy();

    // Section A reflects the row: gate Yes, range, time, 50 reps Yes, single session No.
    expect(value('report-detail-memo-gate')).toBe('نعم');
    expect(screen.getByTestId('memo-details')).toBeTruthy();
    expect(value('report-detail-memo-range')).toBe('البقرة 1 ← 20');
    expect(value('report-detail-memo-time')).toBe('18:00 — 18:45');
    expect(value('report-detail-completed-50')).toBe('نعم');
    expect(value('report-detail-single-session')).toBe('لا');

    // Section B and tafsir.
    expect(value('report-detail-rev-gate')).toBe('نعم');
    expect(screen.getByTestId('rev-details')).toBeTruthy();
    expect(value('report-detail-rev-range')).toBe('الفاتحة 1 ← 7');
    expect(value('report-detail-rev-time')).toBe('19:00 — 19:10');
    expect(value('report-detail-read-tafsir')).toBe('نعم');

    // Read-only: no controls at all (BR-22), no submit, no discard dialog, no error banner.
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByTestId('submit-report-button')).toBeNull();
    expect(screen.queryByTestId('discard-report-dialog')).toBeNull();
    expect(screen.queryByTestId('daily-report-form-banner')).toBeNull();
    expectNoNetworkCall();
  });

  it('renders a Normal report with neither section (BR-48): both gates No, no details, tafsir unanswered', () => {
    renderScreen(bareNormal);

    expect(value('report-detail-memo-gate')).toBe('لا');
    expect(value('report-detail-rev-gate')).toBe('لا');
    expect(screen.queryByTestId('memo-details')).toBeNull();
    expect(screen.queryByTestId('rev-details')).toBeNull();
    expect(screen.queryByTestId('report-detail-single-session')).toBeNull();
    expect(value('report-detail-read-tafsir')).toBe('—');
    expectNoNetworkCall();
  });

  it('hides the single-session row when the 50 repetitions were not completed (VR-18)', () => {
    renderScreen({
      ...fullNormal,
      completed_50_repetitions: false,
      repetitions_in_single_session: null,
    });

    expect(value('report-detail-completed-50')).toBe('لا');
    expect(screen.queryByTestId('report-detail-single-session')).toBeNull();
  });

  it('renders an Absent report as the reason row only, with the missed-day note for Other', () => {
    renderScreen(absent);

    expect(screen.getByTestId('report-detail-title').props.children).toBe(
      'تقرير الأربعاء 5 أوت',
    );
    expect(screen.getByText('يوم فائت')).toBeTruthy();
    expect(screen.getByTestId('absence-section')).toBeTruthy();
    expect(value('report-detail-absence-reason')).toBe('سبب آخر');
    expect(
      screen.getByTestId('report-detail-absence-reason-hint').props.children,
    ).toBe('سيُحتسب هذا كيوم فائت');
    expect(screen.queryByTestId('memo-section')).toBeNull();
    expect(screen.queryByTestId('rev-section')).toBeNull();
    expect(screen.queryByTestId('tafsir-section')).toBeNull();
    expect(screen.queryByTestId('submit-report-button')).toBeNull();

    screen.unmount();
    renderScreen({ ...absent, absence_reason: 'Sick' });
    expect(screen.getByText('غياب بعذر')).toBeTruthy();
    expect(value('report-detail-absence-reason')).toBe('مريض');
    expect(
      screen.queryByTestId('report-detail-absence-reason-hint'),
    ).toBeNull();
    expectNoNetworkCall();
  });

  it('renders a Revision report as range + time with no gate, memorisation or tafsir rows', () => {
    renderScreen(revision);

    expect(screen.getByText('مراجعة')).toBeTruthy();
    expect(value('report-detail-rev-range')).toBe('الفاتحة 1 ← 7');
    expect(value('report-detail-rev-time')).toBe('19:00 — 19:10');
    expect(screen.queryByTestId('report-detail-rev-gate')).toBeNull();
    expect(screen.queryByTestId('memo-section')).toBeNull();
    expect(screen.queryByTestId('tafsir-section')).toBeNull();
    expect(screen.queryByTestId('submit-report-button')).toBeNull();
    expectNoNetworkCall();
  });

  it('goes back from the top-right control (UF §31)', () => {
    renderScreen(absent);
    fireEvent.press(screen.getByTestId('report-detail-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('falls back to Home when there is no history', () => {
    mockCanGoBack.mockReturnValue(false);
    renderScreen(absent);
    fireEvent.press(screen.getByTestId('report-detail-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/student');
  });
});
