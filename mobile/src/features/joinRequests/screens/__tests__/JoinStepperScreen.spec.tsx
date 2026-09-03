import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/** Five toggles reach the VR-04a minimum. */
function selectMinimumAhzab(getByTestId: any) {
  for (let hizb = 1; hizb <= 5; hizb += 1) {
    fireEvent.press(getByTestId(`ahzab-chip-${hizb}`));
  }
}

/** Step 3 filled to the state that enables the submit button (VR-04a et al). */
function fillValidApplication(getByTestId: any) {
  fireEvent.changeText(getByTestId('input-full-name'), 'أحمد التونسي');
  fireEvent.changeText(getByTestId('input-age'), '28');
  fireEvent.changeText(getByTestId('input-phone-number'), '98123456');
  fireEvent.changeText(getByTestId('input-occupation'), 'مهندس');
  fireEvent.changeText(getByTestId('input-city'), 'تونس');

  selectMinimumAhzab(getByTestId);

  fireEvent.press(getByTestId('tajweed-option-Intermediate'));
  fireEvent.press(getByTestId('theory-yes'));
  fireEvent.press(getByTestId('qalun-yes'));
  fireEvent.press(getByTestId('fee-agreement-checkbox'));
}

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

    expect(getByTestId('join-stepper-top-bar-title')).toHaveTextContent(
      'طلب الانضمام',
    );
    expect(getByTestId('step-indicator-bar-1-active')).toBeTruthy();
    expect(getByTestId('step-indicator-bar-2-inactive')).toBeTruthy();
    expect(getByText('ما جنسك؟')).toBeTruthy();
    expect(getByTestId('gender-male-option')).toBeTruthy();
    expect(getByTestId('gender-female-option')).toBeTruthy();

    const submitBtn = getByTestId('step1-submit-button');
    expect(submitBtn.props.accessibilityState.disabled).toBe(true);

    // The top-bar back control leaves the stepper from Step 1
    fireEvent.press(getByTestId('join-stepper-top-bar-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('marks the chosen gender option selected', () => {
    const { getByTestId } = render(<JoinStepperScreen />);

    fireEvent.press(getByTestId('gender-female-option'));
    expect(
      getByTestId('gender-female-option').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      getByTestId('gender-male-option').props.accessibilityState.selected,
    ).toBe(false);
  });

  it('enables Next button upon selecting Male, fetches Male groups, and renders Step 2', async () => {
    const { getByTestId, getByText, findByText } = render(
      <JoinStepperScreen />,
    );
    await navigateToStep2(getByTestId);

    expect(groupsApi.listAvailableGroups).toHaveBeenCalledWith('Male');
    expect(await findByText('المجموعات المتاحة')).toBeTruthy();
    expect(getByTestId('step-indicator-bar-2-active')).toBeTruthy();
    expect(await findByText('حلقة قالون رجال')).toBeTruthy();
    expect(getByText('يوم التسميع: الإثنين')).toBeTruthy();

    // Group Detail sheet (SCR-07): name, "Open" badge, recitation day, CTA
    await act(async () => {
      fireEvent.press(getByTestId('group-card-group-101'));
    });
    expect(getByTestId('group-detail-modal-title')).toHaveTextContent(
      'حلقة قالون رجال',
    );
    expect(getByText('التسجيل مفتوح')).toBeTruthy();
    expect(getByTestId('group-detail-modal-day')).toHaveTextContent('الإثنين');
    expect(getByText('التقديم لهذه المجموعة')).toBeTruthy();
  });

  it('renders the empty state when no group is open for the chosen gender', async () => {
    jest.spyOn(groupsApi, 'listAvailableGroups').mockResolvedValueOnce({
      data: [],
    });
    const { getByTestId, findByText } = render(<JoinStepperScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('gender-female-option'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('step1-submit-button'));
    });

    expect(
      await findByText('لا توجد مجموعات متاحة للإناث حاليًا'),
    ).toBeTruthy();
    expect(getByTestId('empty-groups-state')).toBeTruthy();
  });

  it('renders the retry banner on a network failure and re-fetches on retry, gender kept', async () => {
    jest
      .spyOn(groupsApi, 'listAvailableGroups')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ data: [mockMaleGroup] });
    const { getByTestId, findByText } = render(<JoinStepperScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('gender-male-option'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('step1-submit-button'));
    });

    expect(
      await findByText('تعذّر تحميل المجموعات. جنسك محفوظ — أعد المحاولة.'),
    ).toBeTruthy();
    expect(getByTestId('groups-error-banner')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('groups-error-banner-retry-button'));
    });

    expect(await findByText('حلقة قالون رجال')).toBeTruthy();
    expect(groupsApi.listAvailableGroups).toHaveBeenLastCalledWith('Male');
  });

  it('shows the "no longer available" sheet for a closed group and refreshes the list on close', async () => {
    const closedGroup: groupsApi.GroupListItemLimited = {
      ...mockMaleGroup,
      enrollment_status: 'Closed',
    };
    jest
      .spyOn(groupsApi, 'listAvailableGroups')
      .mockResolvedValueOnce({ data: [closedGroup] })
      .mockResolvedValueOnce({ data: [] });
    const { getByTestId, findByText, getByText } = render(
      <JoinStepperScreen />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('gender-male-option'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('step1-submit-button'));
    });
    await act(async () => {
      fireEvent.press(await waitFor(() => getByTestId('group-card-group-101')));
    });

    expect(getByText('التسجيل مغلق')).toBeTruthy();
    expect(getByTestId('group-detail-modal-unavailable-banner')).toBeTruthy();
    const applyBtn = getByTestId('apply-group-button');
    expect(applyBtn.props.accessibilityState.disabled).toBe(true);
    expect(getByText('لم تعد هذه المجموعة متاحة')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('close-detail-button'));
    });

    expect(
      await findByText('لا توجد مجموعات متاحة للذكور حاليًا'),
    ).toBeTruthy();
    expect(groupsApi.listAvailableGroups).toHaveBeenCalledTimes(2);
  });

  it('navigates to Step 3 upon pressing "التقديم على هذه الحلقة" in modal', async () => {
    const { getByTestId, findByText, getByText } = render(
      <JoinStepperScreen />,
    );
    await navigateToStep3(getByTestId);

    expect(await findByText('ملفك الشخصي')).toBeTruthy();
    expect(getByTestId('step-indicator-bar-3-active')).toBeTruthy();
    expect(getByText('البيانات الأساسية')).toBeTruthy();
    expect(getByTestId('step3-profile-form')).toBeTruthy();
    expect(getByTestId('ahzab-counter')).toHaveTextContent(
      '0 محددة · الحد الأدنى 5',
    );
    expect(
      getByTestId('submit-application-button').props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  /**
   * The five submit outcomes. Reaching any of them means walking the stepper
   * to Step 3 and filling every required field first — fourteen interactions,
   * each one a render of the whole stepper including its sixty ahzab chips.
   * That arrangement lives in the hook: it is written once instead of five
   * times, and a loaded machine times it against its own budget rather than
   * stacking it on top of the outcome each case is actually asserting.
   */
  describe('Step 3 — submitting the application', () => {
    beforeEach(async () => {
      render(<JoinStepperScreen />);
      await navigateToStep3(screen.getByTestId);
      fillValidApplication(screen.getByTestId);
    });

    it('submits the completed form successfully (201)', async () => {
      jest.spyOn(joinRequestsApi, 'submitJoinRequest').mockResolvedValueOnce({
        data: {
          id: 'request-101',
          status: 'Pending',
          score: 55.0,
          created_at: new Date().toISOString(),
        },
      });

      expect(
        screen.getByTestId('submit-application-button').props.accessibilityState
          .disabled,
      ).toBe(false);

      await act(async () => {
        fireEvent.press(screen.getByTestId('submit-application-button'));
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
      expect(
        screen.getByTestId('submit-application-button').props.accessibilityState
          .disabled,
      ).toBe(false);

      // Switch to Revision
      fireEvent.press(screen.getByTestId('goal-revision'));

      expect(screen.getByTestId('revision-block-notice')).toBeTruthy();
      expect(
        await screen.findByText(
          'عذراً، التسجيل متاح حالياً فقط لبرنامج الحفظ والمتابعة اليومية. لا يمكن قبول طلبات المراجعة فقط في هذا الوقت.',
        ),
      ).toBeTruthy();

      expect(
        screen.getByTestId('submit-application-button').props.accessibilityState
          .disabled,
      ).toBe(true);
      expect(joinRequestsApi.submitJoinRequest).not.toHaveBeenCalled();
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

      await act(async () => {
        fireEvent.press(screen.getByTestId('submit-application-button'));
      });

      expect(await screen.findByText('الاسم الكامل غير صالح')).toBeTruthy();
      expect(screen.getByTestId('form-error-banner')).toBeTruthy();
    });

    it('handles 409 GROUP_UNAVAILABLE by returning to Step 2 and re-fetching groups (EC-09)', async () => {
      jest.spyOn(joinRequestsApi, 'submitJoinRequest').mockRejectedValueOnce(
        new ApiError({
          statusCode: 409,
          error: 'GROUP_UNAVAILABLE',
          message: 'الحلقة غير متاحة للتسجيل حالياً',
        }),
      );
      // The list Step 2 comes back to: the group this application named is
      // gone from it.
      jest.spyOn(groupsApi, 'listAvailableGroups').mockResolvedValue({
        data: [],
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('submit-application-button'));
      });

      // Should return to Step 2 with the toast (Figma 54:4735), list re-fetched
      expect(await screen.findByText('المجموعات المتاحة')).toBeTruthy();
      expect(screen.getByTestId('group-unavailable-notice')).toBeTruthy();
      expect(
        await screen.findByText('المجموعة لم تعد متاحة — حُدِّثت القائمة'),
      ).toBeTruthy();
      expect(groupsApi.listAvailableGroups).toHaveBeenLastCalledWith('Male');
    });

    it('handles duplicate submit 409 as silent success routing to home (UF.md §13)', async () => {
      jest.spyOn(joinRequestsApi, 'submitJoinRequest').mockRejectedValueOnce(
        new ApiError({
          statusCode: 409,
          error: 'DUPLICATE_JOIN_REQUEST',
          message: 'لديك طلب انضمام قيد المراجعة بالفعل',
        }),
      );

      await act(async () => {
        fireEvent.press(screen.getByTestId('submit-application-button'));
      });

      expect(mockReplace).toHaveBeenCalledWith('/(app)/user');
    });
  });

  it('steps back from Step 3 to Step 2, then to Step 1, via the top-bar back control', async () => {
    const { getByTestId, findByText } = render(<JoinStepperScreen />);
    await navigateToStep3(getByTestId);

    await act(async () => {
      fireEvent.press(getByTestId('join-stepper-top-bar-back'));
    });
    expect(await findByText('المجموعات المتاحة')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('join-stepper-top-bar-back'));
    });
    expect(await findByText('ما جنسك؟')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
