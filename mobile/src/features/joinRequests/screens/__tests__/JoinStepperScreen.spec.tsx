import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { JoinStepperScreen } from '../JoinStepperScreen';
import * as groupsApi from '@/shared/api/groups.client';
import * as joinRequestsApi from '@/shared/api/joinRequests.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/joinRequests.client');

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
  }),
}));

describe('JoinStepperScreen (SCR-06 Steps 1, 2, and 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockMaleGroup: groupsApi.GroupListItemLimited = {
    id: 'group-101',
    name: 'حلقة قالون رجال',
    recitation_day: 1, // Monday -> الإثنين
    enrollment_status: 'Open',
  };

  async function navigateToStep2(getByTestId: any) {
    jest.spyOn(groupsApi, 'listAvailableGroups').mockResolvedValueOnce({
      data: [mockMaleGroup],
    });

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
  }

  async function navigateToStep3(getByTestId: any) {
    await navigateToStep2(getByTestId);

    const groupCard = await waitFor(() => getByTestId('group-card-group-101'));
    await act(async () => {
      fireEvent.press(groupCard);
    });

    await act(async () => {
      fireEvent.press(getByTestId('apply-group-button'));
    });
  }

  it('renders Step 1 with gender choices and disabled Next button initially', async () => {
    const { getByText, getByTestId } = render(<JoinStepperScreen />);

    expect(getByText('الخطوة 1 من 3: تحديد الجنس')).toBeTruthy();
    expect(getByTestId('gender-male-option')).toBeTruthy();
    expect(getByTestId('gender-female-option')).toBeTruthy();

    const submitBtn = getByTestId('step1-submit-button');
    expect(submitBtn.props.accessibilityState.disabled).toBe(true);
  });

  it('enables Next button upon selecting Male, fetches Male groups, and renders Step 2', async () => {
    const { getByTestId, getByText, findByText } = render(<JoinStepperScreen />);
    await navigateToStep2(getByTestId);

    expect(groupsApi.listAvailableGroups).toHaveBeenCalledWith('Male');
    expect(await findByText('الخطوة 2 من 3: اختيار الحلقة')).toBeTruthy();
    expect(await findByText('حلقة قالون رجال')).toBeTruthy();
    expect(getByText('الإثنين')).toBeTruthy();
    expect(getByText('مفتوح للتسجيل')).toBeTruthy();
  });

  it('navigates to Step 3 upon pressing "التقديم على هذه الحلقة" in modal', async () => {
    const { getByTestId, findByText, getByText } = render(<JoinStepperScreen />);
    await navigateToStep3(getByTestId);

    expect(await findByText('الخطوة 3 من 3: بيانات التقديم')).toBeTruthy();
    expect(getByText('حلقة قالون رجال')).toBeTruthy();
    expect(getByTestId('step3-profile-form')).toBeTruthy();
    expect(getByTestId('submit-application-button').props.accessibilityState.disabled).toBe(true);
  });

  it('completes the Step 3 form and submits successfully (201)', async () => {
    jest.spyOn(joinRequestsApi, 'submitJoinRequest').mockResolvedValueOnce({
      data: {
        id: 'request-101',
        status: 'Pending',
        score: 55.0,
        created_at: new Date().toISOString(),
      },
    });

    const { getByTestId } = render(<JoinStepperScreen />);
    await navigateToStep3(getByTestId);

    // Fill textual fields
    fireEvent.changeText(getByTestId('input-full-name'), 'أحمد التونسي');
    fireEvent.changeText(getByTestId('input-age'), '28');
    fireEvent.changeText(getByTestId('input-phone-number'), '98123456');
    fireEvent.changeText(getByTestId('input-occupation'), 'مهندس');
    fireEvent.changeText(getByTestId('input-city'), 'تونس');

    // Select 5 ahzab
    fireEvent.press(getByTestId('ahzab-chip-1'));
    fireEvent.press(getByTestId('ahzab-chip-2'));
    fireEvent.press(getByTestId('ahzab-chip-3'));
    fireEvent.press(getByTestId('ahzab-chip-4'));
    fireEvent.press(getByTestId('ahzab-chip-5'));

    // Select tajweed level
    fireEvent.press(getByTestId('tajweed-option-Intermediate'));

    // Theory & Qalun
    fireEvent.press(getByTestId('theory-yes'));
    fireEvent.press(getByTestId('qalun-yes'));

    // Fee Agreement
    fireEvent.press(getByTestId('fee-agreement-checkbox'));

    // Submit button should now be enabled
    const submitBtn = getByTestId('submit-application-button');
    expect(submitBtn.props.accessibilityState.disabled).toBe(false);

    // Submit form
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    expect(joinRequestsApi.submitJoinRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: 'group-101',
        full_name: 'أحمد التونسي',
        gender: 'Male',
        age: 28,
        phone_number: '98123456',
        occupation: 'مهندس',
        city: 'تونس',
        memorized_ahzab: [1, 2, 3, 4, 5],
        tajweed_level: 'Intermediate',
        studied_tajweed_theory: true,
        studied_qalun: true,
        fee_agreement: true,
        program_goal: 'Memorization',
      }),
    );

    expect(mockReplace).toHaveBeenCalledWith('/(app)/user');
  });

  it('blocks progression and disables submit if Revision program goal is selected (BR-36)', async () => {
    const { getByTestId, findByText } = render(<JoinStepperScreen />);
    await navigateToStep3(getByTestId);

    // Fill form to valid state
    fireEvent.changeText(getByTestId('input-full-name'), 'أحمد التونسي');
    fireEvent.changeText(getByTestId('input-age'), '28');
    fireEvent.changeText(getByTestId('input-phone-number'), '98123456');
    fireEvent.changeText(getByTestId('input-occupation'), 'مهندس');
    fireEvent.changeText(getByTestId('input-city'), 'تونس');

    fireEvent.press(getByTestId('ahzab-chip-1'));
    fireEvent.press(getByTestId('ahzab-chip-2'));
    fireEvent.press(getByTestId('ahzab-chip-3'));
    fireEvent.press(getByTestId('ahzab-chip-4'));
    fireEvent.press(getByTestId('ahzab-chip-5'));

    fireEvent.press(getByTestId('tajweed-option-Beginner'));
    fireEvent.press(getByTestId('theory-no'));
    fireEvent.press(getByTestId('qalun-no'));
    fireEvent.press(getByTestId('fee-agreement-checkbox'));

    expect(getByTestId('submit-application-button').props.accessibilityState.disabled).toBe(false);

    // Switch to Revision
    fireEvent.press(getByTestId('goal-revision'));

    expect(getByTestId('revision-block-notice')).toBeTruthy();
    expect(
      await findByText(
        'عذراً، التسجيل متاح حالياً فقط لبرنامج الحفظ والمتابعة اليومية. لا يمكن قبول طلبات المراجعة فقط في هذا الوقت.',
      ),
    ).toBeTruthy();

    expect(getByTestId('submit-application-button').props.accessibilityState.disabled).toBe(true);
  });

  it('handles 422 validation errors by rendering inline field errors', async () => {
    jest.spyOn(joinRequestsApi, 'submitJoinRequest').mockRejectedValueOnce(
      new ApiError({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'فشل التحقق من صحة بيانات طلب الانضمام',
        details: [
          {
            field: 'full_name',
            rule: 'VR-03',
            message: 'الاسم الكامل غير صالح',
          },
        ],
      }),
    );

    const { getByTestId, findByText } = render(<JoinStepperScreen />);
    await navigateToStep3(getByTestId);

    fireEvent.changeText(getByTestId('input-full-name'), 'أحمد التونسي');
    fireEvent.changeText(getByTestId('input-age'), '28');
    fireEvent.changeText(getByTestId('input-phone-number'), '98123456');
    fireEvent.changeText(getByTestId('input-occupation'), 'مهندس');
    fireEvent.changeText(getByTestId('input-city'), 'تونس');

    fireEvent.press(getByTestId('ahzab-chip-1'));
    fireEvent.press(getByTestId('ahzab-chip-2'));
    fireEvent.press(getByTestId('ahzab-chip-3'));
    fireEvent.press(getByTestId('ahzab-chip-4'));
    fireEvent.press(getByTestId('ahzab-chip-5'));

    fireEvent.press(getByTestId('tajweed-option-Beginner'));
    fireEvent.press(getByTestId('theory-no'));
    fireEvent.press(getByTestId('qalun-no'));
    fireEvent.press(getByTestId('fee-agreement-checkbox'));

    await act(async () => {
      fireEvent.press(getByTestId('submit-application-button'));
    });

    expect(await findByText('الاسم الكامل غير صالح')).toBeTruthy();
    expect(getByTestId('form-error-banner')).toBeTruthy();
  });

  it('handles 409 GROUP_UNAVAILABLE by returning to Step 2 and re-fetching groups (EC-09)', async () => {
    jest.spyOn(joinRequestsApi, 'submitJoinRequest').mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        error: 'GROUP_UNAVAILABLE',
        message: 'الحلقة غير متاحة للتسجيل حالياً',
      }),
    );

    jest.spyOn(groupsApi, 'listAvailableGroups').mockResolvedValue({
      data: [],
    });

    const { getByTestId, findByText } = render(<JoinStepperScreen />);
    await navigateToStep3(getByTestId);

    fireEvent.changeText(getByTestId('input-full-name'), 'أحمد التونسي');
    fireEvent.changeText(getByTestId('input-age'), '28');
    fireEvent.changeText(getByTestId('input-phone-number'), '98123456');
    fireEvent.changeText(getByTestId('input-occupation'), 'مهندس');
    fireEvent.changeText(getByTestId('input-city'), 'تونس');

    fireEvent.press(getByTestId('ahzab-select-all'));
    fireEvent.press(getByTestId('tajweed-option-Advanced'));
    fireEvent.press(getByTestId('theory-yes'));
    fireEvent.press(getByTestId('qalun-yes'));
    fireEvent.press(getByTestId('fee-agreement-checkbox'));

    await act(async () => {
      fireEvent.press(getByTestId('submit-application-button'));
    });

    // Should return to Step 2
    expect(await findByText('الخطوة 2 من 3: اختيار الحلقة')).toBeTruthy();
    expect(
      await findByText('هذه الحلقة لم تعد متاحة للتسجيل. يرجى اختيار حلقة أخرى.'),
    ).toBeTruthy();
  });

  it('handles duplicate submit 409 as silent success routing to home (UF.md §13)', async () => {
    jest.spyOn(joinRequestsApi, 'submitJoinRequest').mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        error: 'DUPLICATE_JOIN_REQUEST',
        message: 'لديك طلب انضمام قيد المراجعة بالفعل',
      }),
    );

    const { getByTestId } = render(<JoinStepperScreen />);
    await navigateToStep3(getByTestId);

    fireEvent.changeText(getByTestId('input-full-name'), 'أحمد التونسي');
    fireEvent.changeText(getByTestId('input-age'), '28');
    fireEvent.changeText(getByTestId('input-phone-number'), '98123456');
    fireEvent.changeText(getByTestId('input-occupation'), 'مهندس');
    fireEvent.changeText(getByTestId('input-city'), 'تونس');

    fireEvent.press(getByTestId('ahzab-select-all'));
    fireEvent.press(getByTestId('tajweed-option-Advanced'));
    fireEvent.press(getByTestId('theory-yes'));
    fireEvent.press(getByTestId('qalun-yes'));
    fireEvent.press(getByTestId('fee-agreement-checkbox'));

    await act(async () => {
      fireEvent.press(getByTestId('submit-application-button'));
    });

    expect(mockReplace).toHaveBeenCalledWith('/(app)/user');
  });

  it('allows navigating back to Step 2 from Step 3 via back button', async () => {
    const { getByTestId, findByText } = render(<JoinStepperScreen />);
    await navigateToStep3(getByTestId);

    await act(async () => {
      fireEvent.press(getByTestId('step3-back-button'));
    });

    expect(await findByText('الخطوة 2 من 3: اختيار الحلقة')).toBeTruthy();
  });
});
