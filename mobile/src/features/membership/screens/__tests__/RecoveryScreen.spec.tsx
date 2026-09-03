import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import RecoveryScreen from '../RecoveryScreen';
import * as membershipsApi from '@/shared/api/memberships.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/memberships.client');
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

describe('RecoveryScreen (F-MEM-04 / SCR-31, Figma 41:429)', () => {
  const mockMembershipId = '22222222-2222-2222-2222-222222222222';

  const mockRecoveryEmptyHistory: membershipsApi.MembershipRecoveryResponse = {
    data: {
      membership: {
        id: mockMembershipId,
        user: {
          id: 'user-1',
          full_name: 'علي بن أحمد',
          gender: 'Male',
        },
        group: {
          id: 'group-1',
          name: 'حلقة الإمام قالون',
          recitation_day: 5,
          enrollment_status: 'Closed',
        },
        state: 'Terminated',
        started_at: '2026-01-01',
        ended_at: '2026-03-01',
        ended_by: 'admin-1',
      },
      daily_reports: [],
      weekly_reports: [],
      payment_records: [],
    },
  };

  const mockRecoveryPopulated: membershipsApi.MembershipRecoveryResponse = {
    data: {
      membership: {
        id: mockMembershipId,
        user: {
          id: 'user-2',
          full_name: 'مريم التونسية',
          gender: 'Female',
        },
        group: {
          id: 'group-2',
          name: 'حلقة الإمام نافع',
          recitation_day: 1,
          enrollment_status: 'Open',
        },
        state: 'Terminated',
        started_at: '2026-02-01',
        ended_at: '2026-05-01',
        ended_by: 'admin-1',
      },
      daily_reports: [
        {
          id: 'dr-1',
          membership_id: mockMembershipId,
          report_date: '2026-02-02',
          type: 'Normal',
          submitted_at: '2026-02-02T10:00:00.000Z',
          submitted_timezone: 'Africa/Tunis',
          no_memorization_today: false,
          memo_from_ordinal: 1,
          memo_to_ordinal: 10,
          memo_time_from: '08:00:00',
          memo_time_to: '08:30:00',
          completed_50_repetitions: true,
          repetitions_in_single_session: true,
          no_revision_today: false,
          rev_from_ordinal: 1,
          rev_to_ordinal: 5,
          rev_time_from: '08:30:00',
          rev_time_to: '09:00:00',
          read_tafsir: true,
          absence_reason: null,
          deleted_at: '2026-05-01T12:00:00.000Z',
        },
        {
          id: 'dr-2',
          membership_id: mockMembershipId,
          report_date: '2026-02-03',
          type: 'Absent',
          submitted_at: '2026-02-03T10:00:00.000Z',
          submitted_timezone: 'Africa/Tunis',
          no_memorization_today: null,
          memo_from_ordinal: null,
          memo_to_ordinal: null,
          memo_time_from: null,
          memo_time_to: null,
          completed_50_repetitions: null,
          repetitions_in_single_session: null,
          no_revision_today: null,
          rev_from_ordinal: null,
          rev_to_ordinal: null,
          rev_time_from: null,
          rev_time_to: null,
          read_tafsir: null,
          absence_reason: 'Sick',
          deleted_at: '2026-05-01T12:00:00.000Z',
        },
      ],
      weekly_reports: [
        {
          id: 'wr-1',
          membership_id: mockMembershipId,
          week_start: '2026-02-01',
          week_end: '2026-02-07',
          expected_days: 6,
          missed_daily_reports: 2,
          missed_daily_memorization: 0,
          missed_daily_revision: 0,
          missed_50_repetitions: 0,
          missed_single_session: 0,
          attended_recitation_call: true,
          state: 'Finalised',
          finalised_at: '2026-02-07T18:00:00.000Z',
          finalised_by: 'teacher-1',
          deleted_at: '2026-05-01T12:00:00.000Z',
        },
      ],
      payment_records: [
        {
          id: 'pr-1',
          membership_id: mockMembershipId,
          cycle_index: 0,
          amount: '30.00',
          paid_at: '2026-02-01T11:00:00.000Z',
          recorded_by: 'assistant-1',
          deleted_at: '2026-05-01T12:00:00.000Z',
        },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton on initial mount', async () => {
    jest
      .spyOn(membershipsApi, 'getMembershipRecovery')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId, queryByTestId } = render(
      <RecoveryScreen membershipId={mockMembershipId} />,
    );

    expect(getByTestId('recovery-skeleton')).toBeTruthy();
    expect(queryByTestId('membership-info-card')).toBeNull();
    expect(queryByTestId('daily-reports-card')).toBeNull();
  });

  it('renders the retry banner on API failure, and retries on press', async () => {
    jest.spyOn(membershipsApi, 'getMembershipRecovery').mockRejectedValueOnce(
      new ApiError({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      }),
    );

    const { getByTestId, findByText, queryByTestId } = render(
      <RecoveryScreen membershipId={mockMembershipId} />,
    );

    expect(await findByText('المورد المطلوب غير موجود')).toBeTruthy();
    expect(getByTestId('recovery-error').props.accessibilityRole).toBe('alert');
    expect(queryByTestId('recovery-skeleton')).toBeNull();

    jest
      .spyOn(membershipsApi, 'getMembershipRecovery')
      .mockResolvedValueOnce(mockRecoveryEmptyHistory);

    await act(async () => {
      fireEvent.press(getByTestId('recovery-error-retry-button'));
    });

    expect(await findByText('علي بن أحمد')).toBeTruthy();
    expect(queryByTestId('recovery-error')).toBeNull();
  });

  it('names the screen after the student and renders the info banner, the summary and empty sections', async () => {
    jest
      .spyOn(membershipsApi, 'getMembershipRecovery')
      .mockResolvedValueOnce(mockRecoveryEmptyHistory);

    const { getByTestId, findByText, getByText, getAllByText } = render(
      <RecoveryScreen membershipId={mockMembershipId} />,
    );

    expect(await findByText('علي بن أحمد')).toBeTruthy();
    expect(getByTestId('recovery-top-bar-title').props.children).toBe(
      'علي بن أحمد',
    );
    expect(getByTestId('recovery-info-banner')).toHaveTextContent(
      'سجلات محذوفة منطقيًا — عرض للقراءة فقط، لا استعادة للعضوية.',
    );

    // Summary rows (Tunisian month names, Western numerals)
    expect(getByText('حلقة الإمام قالون')).toBeTruthy();
    expect(getByText('1 جانفي 2026')).toBeTruthy();
    expect(getByText('1 مارس 2026')).toBeTruthy();
    expect(getByTestId('membership-state-badge')).toHaveTextContent('منتهية');

    // Empty sections
    expect(getByTestId('daily-reports-empty')).toBeTruthy();
    expect(getByTestId('weekly-reports-empty')).toBeTruthy();
    expect(getByTestId('payment-records-empty')).toBeTruthy();
    expect(getByText('لا توجد تقارير يومية محذوفة')).toBeTruthy();
    expect(getByText('لا توجد تقارير أسبوعية محذوفة')).toBeTruthy();
    expect(getByText('لا توجد سجلات دفع محذوفة')).toBeTruthy();
    expect(getAllByText('لا تقارير')).toHaveLength(2);
  });

  it('renders populated soft-deleted history entries for daily reports, weekly reports, and payments', async () => {
    jest
      .spyOn(membershipsApi, 'getMembershipRecovery')
      .mockResolvedValueOnce(mockRecoveryPopulated);

    const { getByTestId, findByText, getByText, queryByTestId } = render(
      <RecoveryScreen membershipId={mockMembershipId} />,
    );

    expect(await findByText('مريم التونسية')).toBeTruthy();

    // Daily reports: date · summary, count in the section head
    expect(getByTestId('daily-report-row-dr-1')).toHaveTextContent(/2 فيفري/);
    expect(getByTestId('daily-report-row-dr-1')).toHaveTextContent(/عادي/);
    expect(getByTestId('daily-report-row-dr-2')).toHaveTextContent(
      /غياب — مريض/,
    );
    expect(getByText('تقريران')).toBeTruthy();
    expect(queryByTestId('daily-reports-empty')).toBeNull();

    // Weekly report
    expect(getByTestId('weekly-report-row-wr-1')).toHaveTextContent(
      /أسبوع 1 فيفري — 7 فيفري/,
    );
    expect(getByTestId('weekly-report-row-wr-1')).toHaveTextContent(
      /فائت 2 · حضر/,
    );
    expect(queryByTestId('weekly-reports-empty')).toBeNull();

    // Payment record
    expect(getByTestId('payment-record-row-pr-1')).toHaveTextContent(
      /الدورة 1/,
    );
    expect(getByTestId('payment-record-row-pr-1')).toHaveTextContent(
      /30\.00 د\.ت · مدفوع في 1 فيفري/,
    );
    expect(getByText('دورة واحدة')).toBeTruthy();
    expect(queryByTestId('payment-records-empty')).toBeNull();
  });
});
