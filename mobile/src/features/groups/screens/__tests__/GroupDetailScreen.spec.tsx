import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { GroupDetailScreen } from '../GroupDetailScreen';
import * as groupsApi from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');

describe('GroupDetailScreen (SCR-29)', () => {
  const mockGroupId = '11111111-1111-1111-1111-111111111111';

  const mockGroupDetail: groupsApi.GroupListItemFull = {
    id: mockGroupId,
    name: 'حلقة الإمام قالون النموذجية',
    gender: 'Male',
    recitation_day: 5, // الجمعة
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    teacher: {
      id: 'teacher-1',
      full_name: 'الشيخ محمد المنصوري',
    },
    assistant: {
      id: 'assistant-1',
      full_name: 'الأستاذ أحمد التونسي',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton on initial mount', async () => {
    jest
      .spyOn(groupsApi, 'getGroupDetail')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId } = render(<GroupDetailScreen groupId={mockGroupId} />);

    expect(getByTestId('group-detail-skeleton')).toBeTruthy();
  });

  it('renders full group details successfully when API succeeds', async () => {
    jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
      data: mockGroupDetail,
    });

    const { getByTestId, findByText } = render(
      <GroupDetailScreen groupId={mockGroupId} />,
    );

    expect(await findByText('حلقة الإمام قالون النموذجية')).toBeTruthy();
    expect(getByTestId('group-detail-name')).toBeTruthy();
    expect(getByTestId('group-detail-enrollment-badge')).toBeTruthy();
    expect(getByTestId('group-detail-lifecycle-badge')).toBeTruthy();

    expect(getByTestId('group-detail-recitation-day')).toHaveTextContent(
      'الجمعة',
    );
    expect(getByTestId('group-detail-gender')).toHaveTextContent('ذكور (بنين)');
    expect(getByTestId('group-detail-teacher')).toHaveTextContent(
      'الشيخ محمد المنصوري',
    );
    expect(getByTestId('group-detail-assistant')).toHaveTextContent(
      'الأستاذ أحمد التونسي',
    );
    expect(getByTestId('group-detail-riwaya')).toHaveTextContent(
      'قالون عن نافع',
    );
  });

  it('renders error banner when API fails and retries upon pressing retry', async () => {
    jest
      .spyOn(groupsApi, 'getGroupDetail')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 403,
          error: 'Forbidden',
          message: 'غير مصرح لك بالوصول إلى هذه الحلقة',
        }),
      )
      .mockResolvedValueOnce({
        data: mockGroupDetail,
      });

    const { getByTestId, findByText } = render(
      <GroupDetailScreen groupId={mockGroupId} />,
    );

    expect(await findByText('غير مصرح لك بالوصول إلى هذه الحلقة')).toBeTruthy();
    expect(getByTestId('group-detail-error')).toBeTruthy();

    // Click retry
    await act(async () => {
      fireEvent.press(getByTestId('retry-button'));
    });

    // Should fetch again and display the details
    expect(await findByText('حلقة الإمام قالون النموذجية')).toBeTruthy();
    expect(groupsApi.getGroupDetail).toHaveBeenCalledTimes(2);
  });
});
