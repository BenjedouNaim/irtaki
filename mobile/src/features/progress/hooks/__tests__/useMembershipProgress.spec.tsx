import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as progressApi from '@/shared/api/progress.client';
import { ApiError } from '@/shared/api/types';
import {
  useMembershipProgress,
  MEMBERSHIP_PROGRESS_QUERY_KEY,
  membershipProgressQueryKey,
} from '../useMembershipProgress';

jest.mock('@/shared/api/progress.client');

const MEMBERSHIP_ID = 'membership-1';

const mockProgress: progressApi.ProgressDto = {
  ahzab_completed: 15,
  coverage_percent: 25,
  last_memorized_position: { surah: 3, ayah: 34, ordinal: 327 },
  is_activity_pointer_only: true,
};

function renderUseMembershipProgress(membershipId = MEMBERSHIP_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useMembershipProgress(membershipId), {
    wrapper,
  });
  return { ...hook, queryClient };
}

describe('useMembershipProgress (API-042, wired into SCR-24)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes the stable key root ["progress","membership"] (TS §26)', () => {
    expect(MEMBERSHIP_PROGRESS_QUERY_KEY).toEqual(['progress', 'membership']);
    expect(membershipProgressQueryKey(MEMBERSHIP_ID)).toEqual([
      'progress',
      'membership',
      MEMBERSHIP_ID,
    ]);
  });

  it('calls getMembershipProgress with the membership id', async () => {
    jest
      .spyOn(progressApi, 'getMembershipProgress')
      .mockResolvedValue(mockProgress);

    const { result, queryClient } = renderUseMembershipProgress();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(progressApi.getMembershipProgress).toHaveBeenCalledWith(
      MEMBERSHIP_ID,
    );
    expect(result.current.data).toEqual(mockProgress);

    queryClient.clear();
  });

  it('keeps two students in separate cache entries', async () => {
    jest
      .spyOn(progressApi, 'getMembershipProgress')
      .mockResolvedValue(mockProgress);

    const { result, queryClient } = renderUseMembershipProgress('membership-2');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(['progress', 'membership', 'membership-2']),
    ).toEqual(mockProgress);
    expect(
      queryClient.getQueryData(['progress', 'membership', MEMBERSHIP_ID]),
    ).toBeUndefined();

    queryClient.clear();
  });

  it('does not fetch without a membership id', async () => {
    jest
      .spyOn(progressApi, 'getMembershipProgress')
      .mockResolvedValue(mockProgress);

    const { result, queryClient } = renderUseMembershipProgress('');

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(progressApi.getMembershipProgress).not.toHaveBeenCalled();

    queryClient.clear();
  });

  it('surfaces the client error unchanged (TS §29)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    jest.spyOn(progressApi, 'getMembershipProgress').mockRejectedValue(error);

    const { result, queryClient } = renderUseMembershipProgress();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(error);

    queryClient.clear();
  });
});
