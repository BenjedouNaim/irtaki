import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import RecoveryScreen from '../RecoveryScreen';
import * as membershipsApi from '@/shared/api/memberships.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/memberships.client');

describe('RecoveryScreen (F-MEM-04 / SCR-31)', () => {
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
      ],
      weekly_reports: [
        {
          id: 'wr-1',
          membership_id: mockMembershipId,
          week_start: '2026-02-01',
          week_end: '2026-02-07',
          expected_days: 6,
          missed_daily_reports: 0,
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

  it('renders error view with retry button on API failure, and retries on press', async () => {
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
    expect(getByTestId('recovery-error')).toBeTruthy();
    expect(queryByTestId('recovery-skeleton')).toBeNull();

    // Mock successful retry
    jest
      .spyOn(membershipsApi, 'getMembershipRecovery')
      .mockResolvedValueOnce(mockRecoveryEmptyHistory);

    await act(async () => {
      fireEvent.press(getByTestId('retry-button'));
    });

    expect(await findByText('علي بن أحمد')).toBeTruthy();
    expect(queryByTestId('recovery-error')).toBeNull();
  });

  it('renders membership details and clean empty state sections when arrays are empty', async () => {
    jest
      .spyOn(membershipsApi, 'getMembershipRecovery')
      .mockResolvedValueOnce(mockRecoveryEmptyHistory);

    const { getByTestId, findByText } = render(
      <RecoveryScreen membershipId={mockMembershipId} />,
    );

    // Membership details
    expect(await findByText('علي بن أحمد')).toBeTruthy();
    expect(await findByText('ذكر')).toBeTruthy();
    expect(await findByText('حلقة الإمام قالون')).toBeTruthy();
    expect(await findByText('الجمعة')).toBeTruthy();
    expect(await findByText('2026-01-01')).toBeTruthy();
    expect(await findByText('2026-03-01')).toBeTruthy();
    expect(await findByText('محذوفة')).toBeTruthy();

    // Empty state cards
    expect(getByTestId('daily-reports-empty')).toBeTruthy();
    expect(getByTestId('weekly-reports-empty')).toBeTruthy();
    expect(getByTestId('payment-records-empty')).toBeTruthy();

    expect(await findByText('لا توجد تقارير يومية محذوفة')).toBeTruthy();
    expect(await findByText('لا توجد تقارير أسبوعية محذوفة')).toBeTruthy();
    expect(await findByText('لا توجد سجلات دفع محذوفة')).toBeTruthy();
  });

  it('renders populated soft-deleted history entries for daily reports, weekly reports, and payments', async () => {
    jest
      .spyOn(membershipsApi, 'getMembershipRecovery')
      .mockResolvedValueOnce(mockRecoveryPopulated);

    const { getByTestId, findByText, queryByTestId } = render(
      <RecoveryScreen membershipId={mockMembershipId} />,
    );

    expect(await findByText('مريم التونسية')).toBeTruthy();
    expect(await findByText('أنثى')).toBeTruthy();
    expect(await findByText('الاثنين')).toBeTruthy();

    // Daily report rendered
    expect(getByTestId('daily-report-row-dr-1')).toBeTruthy();
    expect(await findByText('2026-02-02')).toBeTruthy();
    expect(await findByText('عادي')).toBeTruthy();
    expect(queryByTestId('daily-reports-empty')).toBeNull();

    // Weekly report rendered
    expect(getByTestId('weekly-report-row-wr-1')).toBeTruthy();
    expect(await findByText('2026-02-01 إلى 2026-02-07')).toBeTruthy();
    expect(await findByText('مؤكد')).toBeTruthy();
    expect(queryByTestId('weekly-reports-empty')).toBeNull();

    // Payment record rendered
    expect(getByTestId('payment-record-row-pr-1')).toBeTruthy();
    expect(await findByText('الدورة 1')).toBeTruthy();
    expect(await findByText('30.00 د.ت')).toBeTruthy();
    expect(queryByTestId('payment-records-empty')).toBeNull();
  });
});
