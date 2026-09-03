import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as weeklyReportsApi from '@/shared/api/weeklyReports.client';
import { ApiError } from '@/shared/api/types';
import {
  useConfirmWeeklyReport,
  CONFIRM_WEEKLY_REPORT_INVALIDATES,
  OWN_WEEKLY_REPORTS_QUERY_KEY,
} from '../useConfirmWeeklyReport';

jest.mock('@/shared/api/weeklyReports.client');

const finalised: weeklyReportsApi.WeeklyReportDto = {
  id: 'weekly-1',
  week_start: '2026-08-29',
  week_end: '2026-09-04',
  expected_days: 6,
  missed_daily_reports: 2,
  missed_daily_memorization: 2,
  missed_daily_revision: 3,
  missed_50_repetitions: 1,
  missed_single_session: 0,
  attended_recitation_call: true,
  state: 'Finalised',
  finalised_at: '2026-09-04T09:00:00.000Z',
  finalised_by: 'Student',
};

function renderConfirm() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useConfirmWeeklyReport(), { wrapper });
  return { ...hook, queryClient };
}

describe('useConfirmWeeklyReport (F-WR-02 / API-034)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('declares the TS §26 invalidation keys once: current week, own weekly history, own performance', () => {
    expect(OWN_WEEKLY_REPORTS_QUERY_KEY).toEqual(['weekly-reports', 'mine']);
    expect(CONFIRM_WEEKLY_REPORT_INVALIDATES).toEqual([
      ['weekly-reports', 'current'],
      ['weekly-reports', 'mine'],
      ['performance', 'mine'],
    ]);
  });

  it('confirms through the client and resolves a finalised outcome', async () => {
    jest
      .spyOn(weeklyReportsApi, 'confirmWeeklyReport')
      .mockResolvedValue(finalised);
    const { result, queryClient } = renderConfirm();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({
        reportId: 'weekly-1',
        attended_recitation_call: true,
      });
    });

    expect(weeklyReportsApi.confirmWeeklyReport).toHaveBeenCalledWith(
      'weekly-1',
      { attended_recitation_call: true },
    );
    expect(outcome).toEqual({ kind: 'finalised', report: finalised });
    queryClient.clear();
  });

  it('invalidates every affected query key on success and nothing else (TS §26)', async () => {
    jest
      .spyOn(weeklyReportsApi, 'confirmWeeklyReport')
      .mockResolvedValue(finalised);
    const { result, queryClient } = renderConfirm();
    queryClient.setQueryData(['weekly-reports', 'current', 'user-1'], {
      id: 'weekly-1',
    });
    queryClient.setQueryData(['performance', 'mine', 'user-1'], { score: 1 });
    queryClient.setQueryData(['daily-reports', 'today', 'user-1'], {});
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync({
        reportId: 'weekly-1',
        attended_recitation_call: false,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (const key of CONFIRM_WEEKLY_REPORT_INVALIDATES) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [...key] });
    }
    expect(
      queryClient.getQueryState(['weekly-reports', 'current', 'user-1'])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(['performance', 'mine', 'user-1'])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(['daily-reports', 'today', 'user-1'])
        ?.isInvalidated,
    ).toBe(false);
    queryClient.clear();
  });

  it('treats 409 ALREADY_FINALISED as an outcome, not an error, and still invalidates (UF §16)', async () => {
    jest.spyOn(weeklyReportsApi, 'confirmWeeklyReport').mockRejectedValue(
      new ApiError({
        statusCode: 409,
        error: 'ALREADY_FINALISED',
        message: 'تم اعتماد هذا التقرير الأسبوعي مسبقاً ولا يمكن تعديله',
      }),
    );
    const { result, queryClient } = renderConfirm();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({
        reportId: 'weekly-1',
        attended_recitation_call: true,
      });
    });

    expect(outcome).toEqual({ kind: 'already_finalised' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['weekly-reports', 'current'],
    });
    queryClient.clear();
  });

  it.each([
    [422, 'NOT_RECITATION_DAY'],
    [422, 'VALIDATION_ERROR'],
    [403, 'SCOPE_DENIED'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [500, 'INTERNAL_ERROR'],
  ])(
    'surfaces a %s %s ApiError unchanged and does not invalidate',
    async (statusCode, code) => {
      const error = new ApiError({ statusCode, error: code, message: 'x' });
      jest
        .spyOn(weeklyReportsApi, 'confirmWeeklyReport')
        .mockRejectedValue(error);
      const { result, queryClient } = renderConfirm();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            reportId: 'weekly-1',
            attended_recitation_call: true,
          }),
        ).rejects.toBe(error);
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(invalidate).not.toHaveBeenCalled();
      queryClient.clear();
    },
  );
});
