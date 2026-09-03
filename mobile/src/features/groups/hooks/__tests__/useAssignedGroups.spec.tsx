import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as groupsApi from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';
import {
  useAssignedGroups,
  ASSIGNED_GROUPS_QUERY_KEY,
} from '../useAssignedGroups';

jest.mock('@/shared/api/groups.client');

const groups: groupsApi.GroupListItemFull[] = [
  {
    id: 'g-1',
    name: 'حلقة الفجر',
    gender: 'Male',
    recitation_day: 4,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    teacher: { id: 't-1', full_name: 'المعلّم' },
    assistant: { id: 'a-1', full_name: 'المساعد' },
  },
];

function renderUseAssignedGroups() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useAssignedGroups(), { wrapper });
  return { ...hook, queryClient };
}

describe('useAssignedGroups (API-010)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes a stable query key (TS §26)', () => {
    expect(ASSIGNED_GROUPS_QUERY_KEY).toEqual(['groups', 'assigned']);
  });

  it('unwraps the APIS §9.1 collection envelope under that key', async () => {
    (groupsApi.listGroups as jest.Mock).mockResolvedValue({ data: groups });

    const { result, queryClient } = renderUseAssignedGroups();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(groups);
    expect(queryClient.getQueryData(['groups', 'assigned'])).toEqual(groups);

    queryClient.clear();
  });

  it('surfaces the client error unchanged so the screen can map it (UF §24)', async () => {
    const error = new ApiError({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'boom',
    });
    (groupsApi.listGroups as jest.Mock).mockRejectedValue(error);

    const { result, queryClient } = renderUseAssignedGroups();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);

    queryClient.clear();
  });
});
