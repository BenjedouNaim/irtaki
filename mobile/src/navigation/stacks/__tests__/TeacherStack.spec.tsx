import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TeacherStack } from '../TeacherStack';
import * as groupsApi from '@/shared/api/groups.client';
import { ApiError, NetworkError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/auth.client');

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const groups: groupsApi.GroupListItemFull[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'حلقة الإمام قالون',
    gender: 'Male',
    recitation_day: 5,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    teacher: { id: 'teacher-1', full_name: 'الشيخ محمد' },
    assistant: { id: 'assistant-1', full_name: null },
  },
];

describe('TeacherStack (SCR-22 stub: Home is the groups list, UF §10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders skeleton rows, then one card per assigned group routing to its student list (UF §26)', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValue({ data: groups });

    render(<TeacherStack />);

    expect(screen.getByTestId('teacher-stack')).toBeTruthy();
    expect(screen.getByTestId('teacher-groups-skeleton')).toBeTruthy();

    const row = await screen.findByTestId(`teacher-group-row-${groups[0].id}`);
    expect(screen.getByText('حلقة الإمام قالون')).toBeTruthy();
    expect(screen.getByText('مفتوح للتسجيل')).toBeTruthy();
    expect(groupsApi.listGroups).toHaveBeenCalledTimes(1);

    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/teacher/groups/[id]/roster',
      params: { id: groups[0].id },
    });
  });

  it('shows "No groups assigned yet" with no CTA (UF §23)', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValue({ data: [] });

    render(<TeacherStack />);

    expect(await screen.findByTestId('teacher-groups-empty')).toBeTruthy();
    expect(screen.getByText('لا توجد حلقات مسندة إليك بعد')).toBeTruthy();
    expect(screen.queryByTestId('teacher-groups-list')).toBeNull();
  });

  it('shows the generic retry banner on a 5xx, never the server string, and retries (UF §24)', async () => {
    const spy = jest
      .spyOn(groupsApi, 'listGroups')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'FATAL: relation "groups" does not exist',
        }),
      )
      .mockResolvedValueOnce({ data: groups });

    render(<TeacherStack />);

    const banner = await screen.findByTestId('teacher-groups-error');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
    expect(
      screen.getByTestId('teacher-groups-error-message').props.children,
    ).toBe('حدث خطأ أثناء تحميل الحلقات');
    expect(screen.queryByText(/relation/)).toBeNull();

    fireEvent.press(screen.getByTestId('teacher-groups-retry-button'));

    expect(
      await screen.findByTestId(`teacher-group-row-${groups[0].id}`),
    ).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('shows the shared connectivity copy on a network failure', async () => {
    jest
      .spyOn(groupsApi, 'listGroups')
      .mockRejectedValue(new NetworkError('Network request failed'));

    render(<TeacherStack />);

    expect(await screen.findByTestId('teacher-groups-error')).toBeTruthy();
    expect(
      screen.getByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();
  });

  it('keeps the profile entry point', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValue({ data: [] });

    render(<TeacherStack />);
    await screen.findByTestId('teacher-groups-empty');

    fireEvent.press(screen.getByTestId('profile-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });
});
