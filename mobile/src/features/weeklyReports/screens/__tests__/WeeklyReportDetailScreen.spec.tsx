import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  WeeklyReportDetailScreen,
  describeFinalisation,
} from '../WeeklyReportDetailScreen';
import { WeeklyReportDto } from '@/shared/api/weeklyReports.client';

// No endpoint of its own: every transport is a mock that fails loudly.
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

const report: WeeklyReportDto = {
  id: 'w1',
  week_start: '2026-08-15',
  week_end: '2026-08-21',
  expected_days: 6,
  missed_daily_reports: 1,
  missed_daily_memorization: 2,
  missed_daily_revision: 3,
  missed_50_repetitions: 4,
  missed_single_session: 5,
  attended_recitation_call: true,
  state: 'Finalised',
  finalised_at: '2026-08-21T09:00:00.000Z',
  finalised_by: 'Student',
};

describe('WeeklyReportDetailScreen (SCR-15 weekly variant, F-WR-03, Figma 50:989)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('renders the week range as the title, the finalisation head row and the six metric rows read-only from the row', () => {
    render(<WeeklyReportDetailScreen report={report} />);

    expect(
      screen.getByTestId('weekly-report-detail-title').props.children,
    ).toBe('أسبوع 15 — 21 أوت');
    expect(screen.getByText('مؤكَّد')).toBeTruthy();
    expect(
      screen.getByTestId('weekly-report-detail-finalised-at').props.children,
    ).toMatch(/^أُكِّد الجمعة 21 أوت \d{2}:\d{2}$/);
    expect(
      screen.getByTestId('metric-expected-days-value').props.children,
    ).toBe('6');
    expect(
      screen.getByTestId('metric-missed-daily-reports-value').props.children,
    ).toBe('1');
    expect(
      screen.getByTestId('metric-missed-daily-memorization-value').props
        .children,
    ).toBe('2');
    expect(
      screen.getByTestId('metric-missed-daily-revision-value').props.children,
    ).toBe('3');
    expect(
      screen.getByTestId('metric-missed-50-repetitions-value').props.children,
    ).toBe('4');
    expect(
      screen.getByTestId('metric-missed-single-session-value').props.children,
    ).toBe('5');
  });

  it('shows the recorded attendance as a read-only row and the auto-close reminder, with no confirm control', () => {
    render(<WeeklyReportDetailScreen report={report} />);

    expect(
      screen.getByTestId('metric-attended-recitation-call-value').props
        .children,
    ).toBe('نعم');
    expect(
      screen.getByTestId('weekly-report-detail-finalised-note-message').props
        .children,
    ).toBe(
      "إن لم يُؤكَّد التقرير في يوم التسميع، يُغلق تلقائيًا في منتصف الليل بحالة 'لم يحضر'.",
    );
    expect(screen.queryByTestId('confirm-weekly-report-button')).toBeNull();
    expect(screen.queryByTestId('attended-toggle')).toBeNull();

    screen.unmount();
    render(
      <WeeklyReportDetailScreen
        report={{
          ...report,
          attended_recitation_call: false,
          finalised_by: 'Scheduler',
        }}
      />,
    );
    expect(
      screen.getByTestId('metric-attended-recitation-call-value').props
        .children,
    ).toBe('لا');
    expect(screen.getByText('أُغلق تلقائيًا')).toBeTruthy();
    expect(
      screen.getByTestId('weekly-report-detail-finalised-at').props.children,
    ).toMatch(/^أُغلق تلقائيًا الجمعة 21 أوت/);
  });

  it('describes the finalisation from the row alone', () => {
    expect(describeFinalisation({ ...report, finalised_at: null })).toBe('');
    expect(
      describeFinalisation({ ...report, finalised_by: 'Scheduler' }),
    ).toMatch(/^أُغلق تلقائيًا /);
  });

  it('goes back from the top-right control (UF §31) and falls back to Home without history', () => {
    render(<WeeklyReportDetailScreen report={report} />);
    fireEvent.press(screen.getByTestId('weekly-report-detail-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    mockCanGoBack.mockReturnValue(false);
    fireEvent.press(screen.getByTestId('weekly-report-detail-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/student');
  });
});
