import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudentTabs } from '../StudentTabs';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import * as dashboardApi from '@/shared/api/dashboard.client';
import * as weeklyReportsApi from '@/shared/api/weeklyReports.client';
import * as meApi from '@/shared/api/me.client';
import * as membershipsApi from '@/shared/api/memberships.client';
import * as paymentsApi from '@/shared/api/payments.client';
import * as progressApi from '@/shared/api/progress.client';
import * as performanceApi from '@/shared/api/performance.client';
import * as quranApi from '@/shared/api/quran.client';
import { ApiError } from '@/shared/api/types';
import { localTodayIsoDate } from '@/features/dailyReports/utils/dailyReportForm';
import {
  addDays,
  parseIsoDate,
  toIsoDate,
} from '@/features/dailyReports/utils/arabicDate';

jest.mock('@/shared/api/dailyReports.client');
jest.mock('@/shared/api/dashboard.client');
jest.mock('@/shared/api/weeklyReports.client');
jest.mock('@/shared/api/me.client');
jest.mock('@/shared/api/memberships.client');
jest.mock('@/shared/api/payments.client');
jest.mock('@/shared/api/progress.client');
jest.mock('@/shared/api/performance.client');
jest.mock('@/shared/api/quran.client');
jest.mock('@/shared/api/auth.client');

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const NEVER = () => new Promise<never>(() => {});

const today = localTodayIsoDate();
const weekStart = toIsoDate(addDays(parseIsoDate(today)!, -3));
const weekEnd = toIsoDate(addDays(parseIsoDate(today)!, 3));

/** API-009's Student arm — the CTA state, the score and the payment chip. */
const studentDashboard: dashboardApi.StudentDashboardDto = {
  can_submit_today: true,
  commitment_score: 86,
  payment: {
    status: 'Due Soon',
    next_due_date: '2026-09-30',
    arrears_count: 0,
  },
};

const liveWeek: weeklyReportsApi.WeeklyReportLiveDto = {
  id: null,
  week_start: weekStart,
  week_end: weekEnd,
  expected_days: 6,
  missed_daily_reports: 2,
  missed_daily_memorization: 2,
  missed_daily_revision: 3,
  missed_50_repetitions: 1,
  missed_single_session: 0,
  attended_recitation_call: false,
  state: 'Open',
  can_confirm: false,
};

let queryClient: QueryClient;

function renderTabs() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudentTabs />
    </QueryClientProvider>,
  );
}

describe('StudentTabs (SCR-08 Home + SCR-13 Progress + SCR-16 Payment, Figma 24:2 / 30:553 / 30:701)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(meApi, 'getMe').mockResolvedValue({
      id: 'u1',
      role: 'Student',
      email: 'khalil@example.com',
      full_name: 'خليل بن يعلى',
      gender: 'Male',
      timezone: 'Africa/Tunis',
    });
    jest.spyOn(membershipsApi, 'getMyMembership').mockResolvedValue({
      id: 'm1',
      group: {
        id: 'g1',
        name: 'حلقة الفجر',
        recitation_day: 6,
        enrollment_status: 'Open',
      },
      started_at: '2026-01-01T00:00:00.000Z',
      state: 'Active',
    });
    jest
      .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
      .mockResolvedValue(liveWeek);
    jest.spyOn(progressApi, 'getMyProgress').mockResolvedValue({
      ahzab_completed: 23,
      coverage_percent: 38.5,
      last_memorized_position: { surah: 2, ayah: 101, ordinal: 108 },
      is_activity_pointer_only: true,
    });
    jest.spyOn(quranApi, 'listSurahs').mockResolvedValue([]);
    jest.spyOn(paymentsApi, 'getMyPayments').mockResolvedValue({
      cycles: [
        {
          index: 0,
          start_date: '2026-01-15',
          end_date: '2026-04-14',
          status: 'Unpaid',
        },
      ],
      next_due_date: '2026-04-14',
      arrears_count: 0,
    });
    jest.spyOn(performanceApi, 'getMyPerformance').mockResolvedValue({
      commitment_score: 86,
      submission_rate: 90,
      memorization_rate: 80,
      revision_rate: 85,
      attendance_rate: 75,
      repetition_quality: 92,
      day_breakdown: {
        normal: 14,
        revision: 5,
        absent_excused: 3,
        absent_other: 2,
        no_report: 4,
      },
      days_since_last_report: 1,
    });
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockResolvedValue(studentDashboard);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('greets the student by first name with the avatar initial and the group + recitation day line', async () => {
    renderTabs();

    expect(screen.getByTestId('student-tabs')).toBeTruthy();
    expect(
      (await screen.findByTestId('home-header-greeting')).props.children,
    ).toMatch(/^(صباح|مساء) الخير، خليل$/);
    expect(screen.getByTestId('home-header-initial').props.children).toBe('خ');
    expect(screen.getByTestId('home-header-membership').props.children).toBe(
      'حلقة الفجر · يوم التسميع: السبت',
    );
  });

  it('shows the header skeleton while the profile loads (Figma 50:1072)', () => {
    jest.spyOn(meApi, 'getMe').mockImplementation(NEVER);

    renderTabs();

    expect(screen.getByTestId('home-header-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('home-header')).toBeNull();
  });

  it('greets without a name or membership line when neither is available', async () => {
    jest.spyOn(meApi, 'getMe').mockResolvedValue({
      id: 'u1',
      role: 'Student',
      email: 'khalil@example.com',
      full_name: null,
      gender: null,
      timezone: 'Africa/Tunis',
    });
    jest.spyOn(membershipsApi, 'getMyMembership').mockRejectedValue(
      new ApiError({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'لا توجد عضوية نشطة',
      }),
    );
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      ...studentDashboard,
      can_submit_today: false,
      block_reason: 'group_archived',
    });

    renderTabs();

    expect(
      (await screen.findByTestId('home-header-greeting')).props.children,
    ).toMatch(/^(صباح|مساء) الخير$/);
    expect(screen.queryByTestId('home-header-initial')).toBeNull();
    expect(screen.queryByTestId('home-header-membership')).toBeNull();
    // A 404 on the membership hides the week card; the CTA banner says why.
    expect(await screen.findByTestId('report-status-card-banner')).toBeTruthy();
    expect(screen.queryByTestId('week-card-error')).toBeNull();
  });

  it('renders the report status card and routes "Submit Today\'s Report" to SCR-09 (UF §26)', async () => {
    renderTabs();

    fireEvent.press(await screen.findByTestId('submit-report-button'));
    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/student/daily-report/type-selection',
    );
  });

  it('keeps the profile entry point on the avatar', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      ...studentDashboard,
      can_submit_today: false,
      block_reason: 'group_archived',
    });

    renderTabs();

    expect(await screen.findByTestId('report-status-card-banner')).toBeTruthy();
    fireEvent.press(await screen.findByTestId('profile-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });

  it('drives the week card from API-033: 7 day cells, recitation day rightmost-last, today outlined, others empty', async () => {
    renderTabs();

    expect(await screen.findByTestId('week-card')).toBeTruthy();
    expect(screen.getByTestId('week-card-count').props.children).toBe(
      '4 من 6 أيام',
    );
    expect(screen.getByText('هذا الأسبوع')).toBeTruthy();
    expect(
      screen.getByTestId(`week-card-strip-${weekEnd}-circle-recitation`),
    ).toBeTruthy();
    expect(
      screen.getByTestId(`week-card-strip-${today}-circle-today`),
    ).toBeTruthy();
    expect(
      screen.getByTestId(`week-card-strip-${weekStart}-circle-future`),
    ).toBeTruthy();
    expect(screen.queryByTestId(/circle-reported$/)).toBeNull();
    expect(screen.queryByTestId(/circle-missed$/)).toBeNull();
  });

  it('shows two skeleton rows while the week loads and a retry banner on failure', async () => {
    const spy = jest
      .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'boom',
        }),
      )
      .mockResolvedValueOnce(liveWeek);

    renderTabs();

    expect(screen.getByTestId('week-card-skeleton')).toBeTruthy();
    expect(screen.getByTestId('week-card-skeleton-row-1')).toBeTruthy();

    const error = await screen.findByTestId('week-card-error');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(screen.getByTestId('week-card-error-message').props.children).toBe(
      'حدث خطأ أثناء تحميل بيانات الأسبوع',
    );
    fireEvent.press(screen.getByTestId('week-card-error-retry-button'));
    expect(await screen.findByTestId('week-card')).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('switches to the Progress tab: the memorization card and the History link to SCR-14 (UF §26)', async () => {
    renderTabs();
    await screen.findByTestId('submit-report-button');

    expect(
      screen.getByTestId('student-tab-bar-home').props.accessibilityState
        .selected,
    ).toBe(true);
    fireEvent.press(screen.getByTestId('student-tab-bar-progress'));

    expect(screen.getByTestId('student-progress')).toBeTruthy();
    expect(screen.getByTestId('progress-top-bar-title').props.children).toBe(
      'التقدّم',
    );
    expect(await screen.findByTestId('progress-section')).toBeTruthy();
    expect(screen.queryByTestId('student-home')).toBeNull();

    // SCR-13 in Figma's order: selector · score · memorization · breakdown ·
    // tiles · days-since · history (F-PERF-01 wrapping F-PRG-02).
    expect(screen.getByTestId('performance-section-period')).toBeTruthy();
    expect(await screen.findByTestId('performance-section-score')).toBeTruthy();
    expect(screen.getByTestId('performance-section-breakdown')).toBeTruthy();
    expect(screen.getByTestId('performance-section-quality')).toBeTruthy();
    expect(screen.getByTestId('performance-section-attendance')).toBeTruthy();
    expect(screen.getByTestId('performance-section-days-since')).toBeTruthy();

    fireEvent.press(screen.getByTestId('report-history-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/student/reports/history');

    fireEvent.press(screen.getByTestId('student-tab-bar-home'));
    expect(await screen.findByTestId('student-home')).toBeTruthy();
  });

  it('switches to the Payment tab: SCR-16 with its own TopBar (F-PAY-01)', async () => {
    renderTabs();
    await screen.findByTestId('submit-report-button');

    const payment = screen.getByTestId('student-tab-bar-payment');
    expect(payment.props.accessibilityState.disabled).toBeUndefined();
    fireEvent.press(payment);

    expect(screen.getByTestId('payment-screen')).toBeTruthy();
    expect(screen.getByTestId('payment-top-bar-title').props.children).toBe(
      'الدفع',
    );
    expect(await screen.findByTestId('payment-content')).toBeTruthy();
    expect(screen.queryByTestId('student-home')).toBeNull();
    expect(
      screen.getByTestId('student-tab-bar-payment').props.accessibilityState
        .selected,
    ).toBe(true);

    fireEvent.press(screen.getByTestId('student-tab-bar-home'));
    expect(await screen.findByTestId('student-home')).toBeTruthy();
  });

  it('routes "View Today\'s Report" to SCR-15 by the id of the report already fetched (F-DR-07)', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      ...studentDashboard,
      can_submit_today: false,
      block_reason: 'already_submitted',
    });
    // Only `already_submitted` needs API-029 — the dashboard deliberately
    // carries no `existing_report` (APIS §10.3), and the CTA must open one.
    jest.spyOn(dailyReportsApi, 'getTodayReportStatus').mockResolvedValue({
      can_submit: false,
      block_reason: 'already_submitted',
      existing_report: {
        id: 'report-today',
        report_date: '2026-09-02',
        type: 'Absent',
        submitted_at: '2026-09-02T08:30:00.000Z',
        submitted_timezone: 'Africa/Tunis',
        no_memorization_today: null,
        memo_range: null,
        memo_time: null,
        completed_50_repetitions: null,
        repetitions_in_single_session: null,
        no_revision_today: null,
        rev_range: null,
        rev_time: null,
        read_tafsir: null,
        absence_reason: 'Sick',
      },
    });

    renderTabs();

    fireEvent.press(await screen.findByTestId('view-report-button'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/student/reports/[id]',
      params: { id: 'report-today' },
    });
    expect(dailyReportsApi.getTodayReportStatus).toHaveBeenCalledTimes(1);
  });

  it('routes "Complete Weekly Report" to SCR-12 on the recitation day (UF §10, F-WR-01)', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      ...studentDashboard,
      can_submit_today: false,
      block_reason: 'recitation_day',
    });

    renderTabs();

    fireEvent.press(await screen.findByTestId('weekly-report-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/student/weekly-report');
    expect(screen.queryByTestId('submit-report-button')).toBeNull();
  });

  it('renders the score and payment tiles from the dashboard (Figma 24:105)', async () => {
    renderTabs();

    await screen.findByTestId('student-summary-tiles');
    expect(
      screen.getByTestId('student-summary-tiles-score-value').props.children,
    ).toBe('86%');
    expect(
      screen.getByTestId('student-summary-tiles-score-caption').props.children,
    ).toBe('الأسبوع الحالي');
    expect(
      screen.getByTestId('student-summary-tiles-payment-badge'),
    ).toHaveTextContent('يستحق قريبًا');
    expect(
      screen.getByTestId('student-summary-tiles-payment-caption').props
        .children,
    ).toBe('الاستحقاق 30 سبتمبر');

    fireEvent.press(screen.getByTestId('student-summary-tiles-payment'));
    expect(screen.getByTestId('payment-screen')).toBeTruthy();
  });

  it('renders a null commitment score as the null state, never 0% (DEC-B04)', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      ...studentDashboard,
      commitment_score: null,
    });

    renderTabs();

    await screen.findByTestId('student-summary-tiles');
    expect(
      screen.getByTestId('student-summary-tiles-score-value').props.children,
    ).toBe('—');
    expect(
      screen.getByTestId('student-summary-tiles-score-caption').props.children,
    ).toBe('بيانات غير كافية');
  });

  it('shows the arrears count on the chip when there are any (UF §10/§18)', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      ...studentDashboard,
      payment: {
        status: 'Unpaid',
        next_due_date: '2026-06-30',
        arrears_count: 3,
      },
    });

    renderTabs();

    await screen.findByTestId('student-summary-tiles');
    expect(
      screen.getByTestId('student-summary-tiles-payment-badge'),
    ).toHaveTextContent('غير مدفوع');
    expect(
      screen.getByTestId('student-summary-tiles-payment-caption').props
        .children,
    ).toBe('3 دورات متأخرة');
  });

  /**
   * F-DASH-03's last checkbox. Home's CTA state now comes from the ONE
   * dashboard call, so API-029 must stay idle — except in the one state
   * where the CTA needs a record the dashboard does not carry.
   */
  it('does not ask API-029 for a state the dashboard already answered', async () => {
    renderTabs();

    await screen.findByTestId('student-summary-tiles');
    expect(dashboardApi.getMyDashboard).toHaveBeenCalledTimes(1);
    expect(dailyReportsApi.getTodayReportStatus).not.toHaveBeenCalled();
    // The weekly strip keeps its own call: API-009 carries no per-day state
    // (UF §10's stated exception for Student Home).
    expect(weeklyReportsApi.getCurrentWeeklyReport).toHaveBeenCalledTimes(1);
  });

  it('keeps the logout entry point', async () => {
    renderTabs();

    expect(await screen.findByTestId('logout-button')).toBeTruthy();
  });
});
