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
}));

describe('CreateGroupScreen (SCR-28)', () => {
  const mockTeachers: usersApi.UserListItem[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
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
      id: '33333333-3333-3333-3333-333333333333',
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

  it('renders form fields, title, and loads staff options', async () => {
    const { getByText, getByTestId, findByText } = render(<CreateGroupScreen />);

    expect(getByText('إنشاء حلقة جديدة')).toBeTruthy();
    expect(getByTestId('group-name-input')).toBeTruthy();
    expect(getByTestId('gender-male-option')).toBeTruthy();
    expect(getByTestId('gender-female-option')).toBeTruthy();
    expect(getByTestId('create-group-submit-button')).toBeTruthy();

    // Staff loaded
    expect(await findByText('الشيخ محمد المنصوري')).toBeTruthy();
    expect(await findByText('الأستاذ سامي المهدوي')).toBeTruthy();
    expect(await findByText('assistant2@test.com')).toBeTruthy(); // Email fallback
  });

  it('displays client-side validation errors when submitting with empty fields', async () => {
    const { getByTestId, findByText } = render(<CreateGroupScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('create-group-submit-button'));
    });

    expect(await findByText('اسم الحلقة مطلوب')).toBeTruthy();
    expect(await findByText('يرجى تحديد الفئة المستهدفة')).toBeTruthy();
    expect(await findByText('يرجى تحديد يوم التسميع')).toBeTruthy();
    expect(await findByText('يرجى اختيار المعلم المشرف')).toBeTruthy();
    expect(await findByText('يرجى اختيار المساعد الإداري')).toBeTruthy();
  });

  it('handles 409 GROUP_NAME_TAKEN by displaying general error banner (UF.md §21)', async () => {
    jest.spyOn(groupsApi, 'createGroup').mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        error: 'GROUP_NAME_TAKEN',
        message: 'اسم الحلقة مستخدم بالفعل',
      }),
    );

    const { getByTestId, findByText } = render(<CreateGroupScreen />);

    // Fill form
    await act(async () => {
      fireEvent.changeText(
        getByTestId('group-name-input'),
        'حلقة مستخدمة مسبقاً',
      );
      fireEvent.press(getByTestId('gender-male-option'));
      fireEvent.press(getByTestId('recitation-day-option-5'));
    });

    // Wait for staff options to load and select
    await findByText('الشيخ محمد المنصوري');
    await act(async () => {
      fireEvent.press(
        getByTestId('teacher-option-11111111-1111-1111-1111-111111111111'),
      );
      fireEvent.press(
        getByTestId('assistant-option-33333333-3333-3333-3333-333333333333'),
      );
    });

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

    const { getByTestId, findByText } = render(<CreateGroupScreen />);

    // Fill form
    await act(async () => {
      fireEvent.changeText(
        getByTestId('group-name-input'),
        'حلقة قالون الجديدة',
      );
      fireEvent.press(getByTestId('gender-male-option'));
      fireEvent.press(getByTestId('recitation-day-option-3'));
    });

    await findByText('الشيخ محمد المنصوري');
    await act(async () => {
      fireEvent.press(
        getByTestId('teacher-option-11111111-1111-1111-1111-111111111111'),
      );
      fireEvent.press(
        getByTestId('assistant-option-33333333-3333-3333-3333-333333333333'),
      );
    });

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
          id: '11111111-1111-1111-1111-111111111111',
          full_name: 'الشيخ محمد المنصوري',
        },
        assistant: {
          id: '33333333-3333-3333-3333-333333333333',
          full_name: 'الأستاذ سامي المهدوي',
        },
      },
    });

    const onSuccess = jest.fn();
    const { getByTestId, findByText } = render(
      <CreateGroupScreen onSuccess={onSuccess} />,
    );

    // Fill form
    await act(async () => {
      fireEvent.changeText(
        getByTestId('group-name-input'),
        'حلقة قالون النموذجية',
      );
      fireEvent.press(getByTestId('gender-male-option'));
      fireEvent.press(getByTestId('recitation-day-option-5'));
    });

    await findByText('الشيخ محمد المنصوري');
    await act(async () => {
      fireEvent.press(
        getByTestId('teacher-option-11111111-1111-1111-1111-111111111111'),
      );
      fireEvent.press(
        getByTestId('assistant-option-33333333-3333-3333-3333-333333333333'),
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('create-group-submit-button'));
    });

    await waitFor(() => {
      expect(groupsApi.createGroup).toHaveBeenCalledWith({
        name: 'حلقة قالون النموذجية',
        gender: 'Male',
        recitation_day: 5,
        teacher_id: '11111111-1111-1111-1111-111111111111',
        assistant_id: '33333333-3333-3333-3333-333333333333',
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

    const { getByTestId, findByText } = render(<CreateGroupScreen />);

    expect(await findByText('فشل تحميل الكادر')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('retry-staff-button'));
    });

    expect(await findByText('الشيخ محمد المنصوري')).toBeTruthy();
  });
});
