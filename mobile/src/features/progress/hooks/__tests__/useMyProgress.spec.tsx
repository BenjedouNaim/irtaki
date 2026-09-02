import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as progressApi from '@/shared/api/progress.client';
import { ApiError } from '@/shared/api/types';
import { useMyProgress, MY_PROGRESS_QUERY_KEY } from '../useMyProgress';

jest.mock('@/shared/api/progress.client');

const mockProgress: progressApi.ProgressDto = {
  ahzab_completed: 23,
  coverage_percent: 38.5,
  last_memorized_position: { surah: 2, ayah: 142, ordinal: 149 },
  is_activity_pointer_only: true,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
}

function renderUseMyProgress() {
  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useMyProgress(), { wrapper });
  return { ...hook, queryClient };
}

describe('useMyProgress (F-PRG-02 / API-041)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable query key ["progress","mine"] for mutation invalidation (TS §26)', () => {
    expect(MY_PROGRESS_QUERY_KEY).toEqual(['progress', 'mine']);
  });

  it('wires getMyProgress as the queryFn under that key and resolves the DTO', async () => {
    jest.spyOn(progressApi, 'getMyProgress').mockResolvedValue(mockProgress);

    const { result, queryClient } = renderUseMyProgress();

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(progressApi.getMyProgress).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockProgress);
    expect(queryClient.getQueryData(['progress', 'mine'])).toEqual(
      mockProgress,
    );
    expect(
      queryClient.getQueryCache().find({ queryKey: MY_PROGRESS_QUERY_KEY }),
    ).toBeTruthy();

    queryClient.clear();
  });

  it('surfaces the client error unchanged so the section can map it (TS §29)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest.spyOn(progressApi, 'getMyProgress').mockRejectedValue(error);

    const { result, queryClient } = renderUseMyProgress();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);
    expect(result.current.data).toBeUndefined();

    queryClient.clear();
  });

  it('refetch() calls getMyProgress again', async () => {
    jest.spyOn(progressApi, 'getMyProgress').mockResolvedValue(mockProgress);

    const { result, queryClient } = renderUseMyProgress();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.refetch();

    expect(progressApi.getMyProgress).toHaveBeenCalledTimes(2);

    queryClient.clear();
  });
});
