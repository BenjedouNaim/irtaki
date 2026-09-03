import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import { ApiError } from '@/shared/api/types';
import {
  useSubmitDailyReport,
  SUBMIT_DAILY_REPORT_INVALIDATES,
} from '../useSubmitDailyReport';

jest.mock('@/shared/api/dailyReports.client');

const payload: dailyReportsApi.SubmitDailyReportPayload = {
  type: 'Absent',
  report_date: '2026-09-02',
  absence_reason: 'Sick',
};

const created: dailyReportsApi.SubmitDailyReportResultDto = {
  id: 'report-1',
  report_date: '2026-09-02',
  type: 'Absent',
  ahzab_completed: 3,
  coverage_updated: false,
};

function renderSubmit() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useSubmitDailyReport(), { wrapper });
  return { ...hook, queryClient };
}

describe('useSubmitDailyReport (F-DR-02 / API-030)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('declares the TS §26 invalidation keys once: today status, own history, live weekly view, own performance, own progress', () => {
    expect(SUBMIT_DAILY_REPORT_INVALIDATES).toEqual([
      ['daily-reports', 'today'],
      ['daily-reports', 'mine'],
      ['weekly-reports', 'current'],
      ['performance', 'mine'],
      ['progress', 'mine'],
    ]);
  });

  it('submits through the client and resolves a created outcome', async () => {
    jest.spyOn(dailyReportsApi, 'submitDailyReport').mockResolvedValue(created);
    const { result, queryClient } = renderSubmit();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync(payload);
    });

    expect(dailyReportsApi.submitDailyReport).toHaveBeenCalledWith(payload);
    expect(outcome).toEqual({ kind: 'created', result: created });
    queryClient.clear();
  });

  it('invalidates every affected query key on success (TS §26)', async () => {
    jest.spyOn(dailyReportsApi, 'submitDailyReport').mockResolvedValue(created);
    const { result, queryClient } = renderSubmit();
    queryClient.setQueryData(['daily-reports', 'today', 'user-1'], {
      can_submit: true,
    });
    queryClient.setQueryData(['progress', 'mine', 'user-1'], {
      ahzab_completed: 2,
    });
    queryClient.setQueryData(['groups', 'list'], []);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (const key of SUBMIT_DAILY_REPORT_INVALIDATES) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [...key] });
    }
    expect(
      queryClient.getQueryState(['daily-reports', 'today', 'user-1'])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(['progress', 'mine', 'user-1'])?.isInvalidated,
    ).toBe(true);
    expect(queryClient.getQueryState(['groups', 'list'])?.isInvalidated).toBe(
      false,
    );
    queryClient.clear();
  });

  it('treats 409 DUPLICATE_REPORT as success with the existing report (UF §36, APIQ-09) and still invalidates', async () => {
    const existing = { id: 'report-existing', type: 'Normal' };
    jest.spyOn(dailyReportsApi, 'submitDailyReport').mockRejectedValue(
      new ApiError({
        statusCode: 409,
        error: 'DUPLICATE_REPORT',
        message: 'لقد قمت بإرسال تقرير اليوم مسبقاً',
        existing_report: existing,
      }),
    );
    const { result, queryClient } = renderSubmit();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync(payload);
    });

    expect(outcome).toEqual({ kind: 'duplicate', existingReport: existing });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['daily-reports', 'today'],
    });
    queryClient.clear();
  });

  it.each([
    [422, 'BACKDATED'],
    [422, 'VALIDATION_ERROR'],
    [403, 'SCOPE_DENIED'],
    [500, 'INTERNAL_ERROR'],
    [409, 'CONFLICT'],
  ])(
    'surfaces a %s %s ApiError unchanged and does not invalidate',
    async (statusCode, code) => {
      const error = new ApiError({ statusCode, error: code, message: 'x' });
      jest.spyOn(dailyReportsApi, 'submitDailyReport').mockRejectedValue(error);
      const { result, queryClient } = renderSubmit();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

      await act(async () => {
        await expect(result.current.mutateAsync(payload)).rejects.toBe(error);
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(invalidate).not.toHaveBeenCalled();
      queryClient.clear();
    },
  );
});
