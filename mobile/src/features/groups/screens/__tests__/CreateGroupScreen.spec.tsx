import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { CreateGroupScreen } from '../CreateGroupScreen';
import * as groupsApi from '@/shared/api/groups.client';
import * as usersApi from '@/shared/api/users.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/users.client');

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  router: { back: jest.fn() },
}));

describe('CreateGroupScreen (SCR-28, Figma 39:230)', () => {
  const TEACHER_ID = '11111111-1111-1111-1111-111111111111';
  const ASSISTANT_ID = '33333333-3333-3333-3333-333333333333';

  const mockTeachers: usersApi.UserListItem[] = [
    {
      id: TEACHER_ID,
      email: 'teacher1@test.com',
      full_name: 'الشيخ محمد المنصوري',
      role: 'Teacher',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      email: 'teacher2@test.com',
      full_name: 'الشيخ أحمد القروي',
      role: 'Teacher',
    },
  ];

  const mockAssistants: usersApi.UserListItem[] = [
    {
      id: ASSISTANT_ID,
      email: 'assistant1@test.com',
      full_name: 'الأستاذ سامي المهدوي',
      role: 'Assistant',
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      email: 'assistant2@test.com',
      full_name: null, // Test fallback to email
      role: 'Assistant',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(usersApi, 'listUsersByRole').mockImplementation((role) => {
      if (role === 'Teacher') {
        return Promise.resolve({ data: mockTeachers });
      }
      if (role === 'Assistant') {
        return Promise.resolve({ data: mockAssistants });
      }
      return Promise.resolve({ data: [] });
    });
  });

  /** Picks a teacher and an assistant through the picker sheets. */
  async function chooseStaff(
    findByTestId: (id: string) => Promise<any>,
    getByTestId: (id: string) => any,
  ) {
    fireEvent.press(await findByTestId('teacher-picker'));
    await act(async () => {
      fireEvent.press(getByTestId(`teacher-option-${TEACHER_ID}`));
    });
    fireEvent.press(getByTestId('assistant-picker'));
    await act(async () => {
      fireEvent.press(getByTestId(`assistant-option-${ASSISTANT_ID}`));
    });
  }

  it('renders the heading, the fields, the day letters (Saturday first) and loads the staff pickers', async () => {
    const { getByText, getByTestId, findByTestId, queryByText } = render(
      <CreateGroupScreen />,
    );

    expect(getByTestId('create-group-top-bar-title').props.children).toBe(
      'مجموعة جديدة',
    );
    expect(getByText('إعداد المجموعة')).toBeTruthy();
    expect(
      getByText(
        'تُنشأ المجموعة مغلقة التسجيل ونشطة. يوم التسميع لا يُعدَّل لاحقًا.',
      ),
    ).toBeTruthy();
    expect(getByTestId('group-name-input')).toBeTruthy();
    expect(getByText('يجب أن يكون فريدًا')).toBeTruthy();
    expect(getByTestId('gender-Male')).toBeTruthy();
    expect(getByTestId('gender-Female')).toBeTruthy();
    expect(getByText('س')).toBeTruthy();
    expect(getByText('ج')).toBeTruthy();
    expect(getByTestId('staff-loading-skeleton')).toBeTruthy();
    expect(getByTestId('create-group-submit-button')).toBeTruthy();

    // Staff loaded → pickers with placeholders; candidates live in the sheet.
    expect(await findByTestId('teacher-picker')).toBeTruthy();
    expect(getByText('اختر المعلّم')).toBeTruthy();
    expect(getByText('اختر المساعد')).toBeTruthy();
    expect(queryByText('الشيخ محمد المنصوري')).toBeNull();

    fireEvent.press(getByTestId('assistant-picker'));
    expect(getByText('الأستاذ سامي المهدوي')).toBeTruthy();
    expect(getByText('assistant2@test.com')).toBeTruthy(); // Email fallback
  });

  it('displays client-side validation errors when submitting with empty fields', async () => {
    const { getByTestId, findByText } = render(<CreateGroupScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('create-group-submit-button'));
    });

    expect(await findByText('اسم المجموعة مطلوب')).toBeTruthy();
    expect(await findByText('يرجى تحديد الجنس')).toBeTruthy();
    expect(await findByText('يرجى تحديد يوم التسميع')).toBeTruthy();
    expect(await findByText('يرجى اختيار المعلّم')).toBeTruthy();
    expect(await findByText('يرجى اختيار المساعد')).toBeTruthy();
  });

  it('shows the fixed-day helper once a day is chosen', async () => {
    const { getByTestId, getByText } = render(<CreateGroupScreen />);

    fireEvent.press(getByTestId('recitation-day-option-6'));
    expect(getByText('السبت — يُثبَّت عند الإنشاء')).toBeTruthy();
    expect(
      getByTestId('recitation-day-option-6').props.accessibilityState.selected,
    ).toBe(true);
  });

  it('handles 409 GROUP_NAME_TAKEN by displaying the error banner (UF.md §21)', async () => {
    jest.spyOn(groupsApi, 'createGroup').mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        error: 'GROUP_NAME_TAKEN',
        message: 'اسم الحلقة مستخدم بالفعل',
      }),
    );

    const { getByTestId, findByText, findByTestId } = render(
      <CreateGroupScreen />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('group-name-input'),
        'حلقة مستخدمة مسبقاً',
      );
      fireEvent.press(getByTestId('gender-Male'));
      fireEvent.press(getByTestId('recitation-day-option-5'));
    });

    await chooseStaff(findByTestId, getByTestId);

    await act(async () => {
      fireEvent.press(getByTestId('create-group-submit-button'));
    });

    expect(await findByText('اسم الحلقة مستخدم بالفعل')).toBeTruthy();
    expect(getByTestId('create-group-general-error')).toBeTruthy();
  });

  it('handles 422 validation errors with field details by displaying inline error', async () => {
    jest.spyOn(groupsApi, 'createGroup').mockRejectedValueOnce(
      new ApiError({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'بيانات غير صالحة',
        details: [
          {
            field: 'teacher_id',
            rule: 'VR-24',
            message: 'المستخدم المحدد ليس معلماً مؤهلاً',
          },
        ],
      }),
    );

    const { getByTestId, findByText, findByTestId } = render(
      <CreateGroupScreen />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('group-name-input'),
        'حلقة قالون الجديدة',
      );
      fireEvent.press(getByTestId('gender-Male'));
      fireEvent.press(getByTestId('recitation-day-option-3'));
    });

    await chooseStaff(findByTestId, getByTestId);

    await act(async () => {
      fireEvent.press(getByTestId('create-group-submit-button'));
    });

    expect(await findByText('المستخدم المحدد ليس معلماً مؤهلاً')).toBeTruthy();
  });

  it('submits valid form and navigates to group detail on 201 response', async () => {
    const createdGroupId = 'new-group-uuid-999';
    jest.spyOn(groupsApi, 'createGroup').mockResolvedValueOnce({
      data: {
        id: createdGroupId,
        name: 'حلقة قالون النموذجية',
        gender: 'Male',
        recitation_day: 5,
        enrollment_status: 'Closed',
        lifecycle_state: 'Active',
        teacher: {
          id: TEACHER_ID,
          full_name: 'الشيخ محمد المنصوري',
        },
        assistant: {
          id: ASSISTANT_ID,
          full_name: 'الأستاذ سامي المهدوي',
        },
      },
    });

    const onSuccess = jest.fn();
    const { getByTestId, findByTestId, getByText } = render(
      <CreateGroupScreen onSuccess={onSuccess} />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('group-name-input'),
        'حلقة قالون النموذجية',
      );
      fireEvent.press(getByTestId('gender-Male'));
      fireEvent.press(getByTestId('recitation-day-option-5'));
    });

    await chooseStaff(findByTestId, getByTestId);
    // The chosen staff now show on the picker rows.
    expect(getByText('الشيخ محمد المنصوري')).toBeTruthy();
    expect(getByText('الأستاذ سامي المهدوي')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('create-group-submit-button'));
    });

    await waitFor(() => {
      expect(groupsApi.createGroup).toHaveBeenCalledWith({
        name: 'حلقة قالون النموذجية',
        gender: 'Male',
        recitation_day: 5,
        teacher_id: TEACHER_ID,
        assistant_id: ASSISTANT_ID,
      });
      expect(onSuccess).toHaveBeenCalledWith(createdGroupId);
    });
  });

  it('handles staff load error and retries upon pressing retry button', async () => {
    jest
      .spyOn(usersApi, 'listUsersByRole')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'فشل تحميل الكادر',
        }),
      )
      .mockImplementation((role) => {
        if (role === 'Teacher') {
          return Promise.resolve({ data: mockTeachers });
        }
        return Promise.resolve({ data: mockAssistants });
      });

    const { getByTestId, findByText, findByTestId } = render(
      <CreateGroupScreen />,
    );

    expect(await findByText('فشل تحميل الكادر')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('staff-error-retry-button'));
    });

    expect(await findByTestId('teacher-picker')).toBeTruthy();
  });
});
