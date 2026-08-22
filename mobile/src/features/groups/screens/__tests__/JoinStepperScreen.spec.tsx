import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { JoinStepperScreen } from '../JoinStepperScreen';
import * as groupsApi from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

describe('JoinStepperScreen (SCR-06 Steps 1 & 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Step 1 with gender choices and disabled Next button initially', async () => {
    const { getByText, getByTestId } = await render(<JoinStepperScreen />);

    expect(getByText('الخطوة 1 من 3: تحديد الجنس')).toBeTruthy();
    expect(getByTestId('gender-male-option')).toBeTruthy();
    expect(getByTestId('gender-female-option')).toBeTruthy();

    const submitBtn = getByTestId('step1-submit-button');
    expect(submitBtn.props.accessibilityState.disabled).toBe(true);
  });

  it('enables Next button upon selecting Male, fetches Male groups, and renders Step 2', async () => {
    const mockGroups: groupsApi.ListGroupsResponse = {
      data: [
        {
          id: 'group-101',
          name: 'حلقة قالون رجال',
          recitation_day: 1, // Monday -> الإثنين
          enrollment_status: 'Open',
        },
      ],
    };

    jest
      .spyOn(groupsApi, 'listAvailableGroups')
      .mockResolvedValueOnce(mockGroups);

    const { getByTestId, getByText, findByText } = await render(
      <JoinStepperScreen />,
    );

    // Select Male
    await act(async () => {
      fireEvent.press(getByTestId('gender-male-option'));
    });

    // Next button should now be enabled
    await waitFor(() => {
      expect(
        getByTestId('step1-submit-button').props.accessibilityState.disabled,
      ).toBe(false);
    });

    // Press next
    await act(async () => {
      fireEvent.press(getByTestId('step1-submit-button'));
    });

    expect(groupsApi.listAvailableGroups).toHaveBeenCalledWith('Male');

    // Should transition to Step 2
    expect(await findByText('الخطوة 2 من 3: اختيار الحلقة')).toBeTruthy();
    expect(await findByText('حلقة قالون رجال')).toBeTruthy();
    expect(getByText('الإثنين')).toBeTruthy();
    expect(getByText('مفتوح للتسجيل')).toBeTruthy();
  });

  it('renders empty state when 0 groups are returned for selected gender', async () => {
    jest.spyOn(groupsApi, 'listAvailableGroups').mockResolvedValueOnce({
      data: [],
    });

    const { getByTestId, findByText } = await render(<JoinStepperScreen />);

    // Select Female
    await act(async () => {
      fireEvent.press(getByTestId('gender-female-option'));
    });

    await waitFor(() => {
      expect(
        getByTestId('step1-submit-button').props.accessibilityState.disabled,
      ).toBe(false);
    });

    await act(async () => {
      fireEvent.press(getByTestId('step1-submit-button'));
    });

    expect(groupsApi.listAvailableGroups).toHaveBeenCalledWith('Female');

    expect(
      await findByText('لا توجد حلقات متاحة لـ الإناث حالياً'),
    ).toBeTruthy();
    expect(getByTestId('empty-groups-state')).toBeTruthy();
    expect(getByTestId('empty-back-button')).toBeTruthy();
  });

  it('navigates back to Step 1 when "تغيير الجنس" is pressed in Step 2', async () => {
    jest.spyOn(groupsApi, 'listAvailableGroups').mockResolvedValueOnce({
      data: [],
    });

    const { getByTestId, findByText } = await render(<JoinStepperScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('gender-male-option'));
    });

    await waitFor(() => {
      expect(
        getByTestId('step1-submit-button').props.accessibilityState.disabled,
      ).toBe(false);
    });

    await act(async () => {
      fireEvent.press(getByTestId('step1-submit-button'));
    });

    await findByText('الخطوة 2 من 3: اختيار الحلقة');

    // Press change gender
    await act(async () => {
      fireEvent.press(getByTestId('change-gender-button'));
    });

    expect(getByTestId('gender-male-option')).toBeTruthy();
    expect(getByTestId('gender-female-option')).toBeTruthy();
  });

  it('displays error banner and retry button on fetch failure', async () => {
    jest.spyOn(groupsApi, 'listAvailableGroups').mockRejectedValueOnce(
      new ApiError({
        statusCode: 500,
        error: 'SERVER_ERROR',
        message: 'فشل في جلب البيانات من الخادم',
      }),
    );

    const { getByTestId, findByText } = await render(<JoinStepperScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('gender-male-option'));
    });

    await waitFor(() => {
      expect(
        getByTestId('step1-submit-button').props.accessibilityState.disabled,
      ).toBe(false);
    });

    await act(async () => {
      fireEvent.press(getByTestId('step1-submit-button'));
    });

    expect(await findByText('فشل في جلب البيانات من الخادم')).toBeTruthy();
    expect(getByTestId('groups-error-banner')).toBeTruthy();
    expect(getByTestId('retry-fetch-button')).toBeTruthy();
  });

  it('opens SCR-07 Group Detail Modal when a group card is pressed', async () => {
    const mockGroups: groupsApi.ListGroupsResponse = {
      data: [
        {
          id: 'group-202',
          name: 'حلقة نافع المدني',
          recitation_day: 3, // Wednesday -> الأربعاء
          enrollment_status: 'Open',
        },
      ],
    };

    jest
      .spyOn(groupsApi, 'listAvailableGroups')
      .mockResolvedValueOnce(mockGroups);

    const { getByTestId } = await render(<JoinStepperScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('gender-male-option'));
    });

    await waitFor(() => {
      expect(
        getByTestId('step1-submit-button').props.accessibilityState.disabled,
      ).toBe(false);
    });

    await act(async () => {
      fireEvent.press(getByTestId('step1-submit-button'));
    });

    const groupCard = await waitFor(() => getByTestId('group-card-group-202'));
    expect(groupCard).toBeTruthy();

    await act(async () => {
      fireEvent.press(groupCard);
    });

    // Modal should be visible with apply button
    expect(getByTestId('group-detail-modal')).toBeTruthy();
    expect(getByTestId('apply-group-button')).toBeTruthy();

    // Press Apply
    await act(async () => {
      fireEvent.press(getByTestId('apply-group-button'));
    });
    expect(getByTestId('apply-notice')).toBeTruthy();

    // Close modal
    await act(async () => {
      fireEvent.press(getByTestId('close-detail-button'));
    });
  });

  it('navigates back to home when cancel button is pressed in Step 1', async () => {
    const { getByTestId } = await render(<JoinStepperScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('cancel-button'));
    });
    expect(mockBack).toHaveBeenCalled();
  });
});
