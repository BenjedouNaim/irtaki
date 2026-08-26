import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import RosterScreen from '../RosterScreen';
import * as membershipsApi from '@/shared/api/memberships.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/memberships.client');

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
}));

describe('RosterScreen (F-MEM-02)', () => {
  const mockGroupId = '11111111-1111-1111-1111-111111111111';

  const mockRoster: membershipsApi.RosterEntry[] = [
    {
      id: 'membership-1',
      user: { id: 'user-1', full_name: 'محمد بن علي', gender: 'Male' },
      started_at: '2026-01-15T00:00:00.000Z',
      state: 'Active',
    },
    {
      id: 'membership-2',
      user: { id: 'user-2', full_name: 'فاطمة بن صالح', gender: 'Female' },
      started_at: '2025-09-01T00:00:00.000Z',
      state: 'Terminated',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton on initial mount', async () => {
    jest
      .spyOn(membershipsApi, 'getGroupMemberships')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId, queryByTestId } = render(
      <RosterScreen groupId={mockGroupId} />,
    );

    expect(getByTestId('roster-skeleton')).toBeTruthy();
    expect(queryByTestId('roster-list')).toBeNull();
    expect(queryByTestId('roster-empty')).toBeNull();
    expect(queryByTestId('roster-error')).toBeNull();
  });

  it('renders populated roster list with member names and status badges when API succeeds', async () => {
    jest
      .spyOn(membershipsApi, 'getGroupMemberships')
      .mockResolvedValueOnce({ data: mockRoster });

    const { getByTestId, findByText, queryByTestId } = render(
      <RosterScreen groupId={mockGroupId} />,
    );

    // Rows render with member names
    expect(await findByText('محمد بن علي')).toBeTruthy();
    expect(getByTestId('roster-list')).toBeTruthy();
    expect(queryByTestId('roster-skeleton')).toBeNull();

    expect(getByTestId('roster-row-membership-1')).toBeTruthy();
    expect(getByTestId('roster-row-membership-2')).toBeTruthy();

    // Active membership shows the active badge label
    expect(await findByText('نشطة')).toBeTruthy();

    // Terminated membership shows the terminated badge label
    expect(await findByText('محذوف')).toBeTruthy();
  });

  it('does not navigate when pressing a roster row (rows are non-navigable)', async () => {
    jest
      .spyOn(membershipsApi, 'getGroupMemberships')
      .mockResolvedValueOnce({ data: mockRoster });

    const { getByTestId, findByText } = render(
      <RosterScreen groupId={mockGroupId} />,
    );

    expect(await findByText('فاطمة بن صالح')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('roster-row-membership-2'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('roster-row-membership-1'));
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('renders empty state when the group has no members', async () => {
    jest
      .spyOn(membershipsApi, 'getGroupMemberships')
      .mockResolvedValueOnce({ data: [] });

    const { getByTestId, findByText, queryByTestId } = render(
      <RosterScreen groupId={mockGroupId} />,
    );

    expect(await findByText('لا يوجد طلاب في هذه الحلقة بعد')).toBeTruthy();
    expect(getByTestId('roster-empty')).toBeTruthy();
    expect(queryByTestId('roster-list')).toBeNull();
    expect(queryByTestId('roster-skeleton')).toBeNull();
  });

  it('renders error card with API message on ApiError and recovers upon retry', async () => {
    const getSpy = jest
      .spyOn(membershipsApi, 'getGroupMemberships')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'خطأ في جلب قائمة الطلاب',
        }),
      )
      .mockResolvedValueOnce({ data: mockRoster });

    const { getByTestId, findByText, queryByTestId } = render(
      <RosterScreen groupId={mockGroupId} />,
    );

    expect(await findByText('خطأ في جلب قائمة الطلاب')).toBeTruthy();
    expect(getByTestId('roster-error')).toBeTruthy();
    expect(queryByTestId('roster-list')).toBeNull();

    // Click retry
    await act(async () => {
      fireEvent.press(getByTestId('retry-button'));
    });

    expect(await findByText('محمد بن علي')).toBeTruthy();
    expect(queryByTestId('roster-error')).toBeNull();
    expect(getByTestId('roster-list')).toBeTruthy();
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it('renders generic connectivity error message on non-ApiError failure', async () => {
    jest
      .spyOn(membershipsApi, 'getGroupMemberships')
      .mockRejectedValueOnce(new Error('Network error'));

    const { getByTestId, findByText } = render(
      <RosterScreen groupId={mockGroupId} />,
    );

    expect(
      await findByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();
    expect(getByTestId('roster-error')).toBeTruthy();
  });
});
