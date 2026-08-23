import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { StaffReassignmentPanel } from '../StaffReassignmentPanel';
import * as groupsApi from '@/shared/api/groups.client';
import * as usersApi from '@/shared/api/users.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/users.client');

describe('StaffReassignmentPanel Component', () => {
  const mockGroupId = '11111111-1111-1111-1111-111111111111';

  const mockCurrentTeacher = {
    id: 'teacher-1',
    full_name: 'الشيخ محمد الحالي',
  };

  const mockCurrentAssistant = {
    id: 'assistant-1',
    full_name: 'الأستاذ أحمد الحالي',
  };

  const mockTeachersList: usersApi.UserListItem[] = [
    {
      id: 'teacher-1',
      email: 'teacher1@test.com',
      full_name: 'الشيخ محمد الحالي',
      role: 'Teacher',
    },
    {
      id: 'teacher-2',
      email: 'teacher2@test.com',
      full_name: 'الشيخ علي الجديد',
      role: 'Teacher',
    },
  ];

  const mockAssistantsList: usersApi.UserListItem[] = [
    {
      id: 'assistant-1',
      email: 'assistant1@test.com',
      full_name: 'الأستاذ أحمد الحالي',
      role: 'Assistant',
    },
    {
      id: 'assistant-2',
      email: 'assistant2@test.com',
      full_name: 'الأستاذ كمال الجديد',
      role: 'Assistant',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton initially while fetching staff', () => {
    jest
      .spyOn(usersApi, 'listUsersByRole')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId } = render(
      <StaffReassignmentPanel
        groupId={mockGroupId}
        currentTeacher={mockCurrentTeacher}
        currentAssistant={mockCurrentAssistant}
      />,
    );

    expect(getByTestId('staff-reassign-loading')).toBeTruthy();
  });

  it('renders staff options with current teacher and assistant selected, and save button disabled', async () => {
    jest.spyOn(usersApi, 'listUsersByRole').mockImplementation((role) => {
      if (role === 'Teacher') {
        return Promise.resolve({ data: mockTeachersList });
      }
      return Promise.resolve({ data: mockAssistantsList });
    });

    const { findByText, getByTestId } = render(
      <StaffReassignmentPanel
        groupId={mockGroupId}
        currentTeacher={mockCurrentTeacher}
        currentAssistant={mockCurrentAssistant}
      />,
    );

    expect(await findByText('الشيخ محمد الحالي')).toBeTruthy();
    expect(await findByText('الأستاذ أحمد الحالي')).toBeTruthy();
    expect(await findByText('الشيخ علي الجديد')).toBeTruthy();
    expect(await findByText('الأستاذ كمال الجديد')).toBeTruthy();

    const saveButton = getByTestId('reassign-staff-save-button');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });

  it('enables save button when a new teacher is selected, and calls reassignStaff upon save', async () => {
    jest.spyOn(usersApi, 'listUsersByRole').mockImplementation((role) => {
      if (role === 'Teacher') {
        return Promise.resolve({ data: mockTeachersList });
      }
      return Promise.resolve({ data: mockAssistantsList });
    });

    const updatedGroupResponse: groupsApi.GroupListItemFull = {
      id: mockGroupId,
      name: 'حلقة قالون',
      gender: 'Male',
      recitation_day: 5,
      enrollment_status: 'Open',
      lifecycle_state: 'Active',
      teacher: { id: 'teacher-2', full_name: 'الشيخ علي الجديد' },
      assistant: mockCurrentAssistant,
    };

    const reassignSpy = jest
      .spyOn(groupsApi, 'reassignStaff')
      .mockResolvedValueOnce({
        data: updatedGroupResponse,
      });

    const onReassignedMock = jest.fn();

    const { findByTestId, getByTestId } = render(
      <StaffReassignmentPanel
        groupId={mockGroupId}
        currentTeacher={mockCurrentTeacher}
        currentAssistant={mockCurrentAssistant}
        onReassigned={onReassignedMock}
      />,
    );

    const newTeacherOption = await findByTestId(
      'reassign-teacher-option-teacher-2',
    );
    fireEvent.press(newTeacherOption);

    const saveButton = getByTestId('reassign-staff-save-button');
    expect(saveButton.props.accessibilityState.disabled).toBe(false);

    await act(async () => {
      fireEvent.press(saveButton);
    });

    expect(reassignSpy).toHaveBeenCalledWith(mockGroupId, {
      teacher_id: 'teacher-2',
    });
    expect(onReassignedMock).toHaveBeenCalledWith(updatedGroupResponse);
  });

  it('enables save button when both new teacher and assistant are selected and submits both', async () => {
    jest.spyOn(usersApi, 'listUsersByRole').mockImplementation((role) => {
      if (role === 'Teacher') {
        return Promise.resolve({ data: mockTeachersList });
      }
      return Promise.resolve({ data: mockAssistantsList });
    });

    const updatedGroupResponse: groupsApi.GroupListItemFull = {
      id: mockGroupId,
      name: 'حلقة قالون',
      gender: 'Male',
      recitation_day: 5,
      enrollment_status: 'Open',
      lifecycle_state: 'Active',
      teacher: { id: 'teacher-2', full_name: 'الشيخ علي الجديد' },
      assistant: { id: 'assistant-2', full_name: 'الأستاذ كمال الجديد' },
    };

    const reassignSpy = jest
      .spyOn(groupsApi, 'reassignStaff')
      .mockResolvedValueOnce({
        data: updatedGroupResponse,
      });

    const onReassignedMock = jest.fn();

    const { findByTestId, getByTestId } = render(
      <StaffReassignmentPanel
        groupId={mockGroupId}
        currentTeacher={mockCurrentTeacher}
        currentAssistant={mockCurrentAssistant}
        onReassigned={onReassignedMock}
      />,
    );

    const newTeacherOption = await findByTestId(
      'reassign-teacher-option-teacher-2',
    );
    const newAssistantOption = await findByTestId(
      'reassign-assistant-option-assistant-2',
    );

    fireEvent.press(newTeacherOption);
    fireEvent.press(newAssistantOption);

    const saveButton = getByTestId('reassign-staff-save-button');
    await act(async () => {
      fireEvent.press(saveButton);
    });

    expect(reassignSpy).toHaveBeenCalledWith(mockGroupId, {
      teacher_id: 'teacher-2',
      assistant_id: 'assistant-2',
    });
    expect(onReassignedMock).toHaveBeenCalledWith(updatedGroupResponse);
  });

  it('displays error banner when reassignStaff fails with 422 role mismatch', async () => {
    jest.spyOn(usersApi, 'listUsersByRole').mockImplementation((role) => {
      if (role === 'Teacher') {
        return Promise.resolve({ data: mockTeachersList });
      }
      return Promise.resolve({ data: mockAssistantsList });
    });

    jest.spyOn(groupsApi, 'reassignStaff').mockRejectedValueOnce(
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

    const { findByTestId, getByTestId, findByText } = render(
      <StaffReassignmentPanel
        groupId={mockGroupId}
        currentTeacher={mockCurrentTeacher}
        currentAssistant={mockCurrentAssistant}
      />,
    );

    const newTeacherOption = await findByTestId(
      'reassign-teacher-option-teacher-2',
    );
    fireEvent.press(newTeacherOption);

    const saveButton = getByTestId('reassign-staff-save-button');
    await act(async () => {
      fireEvent.press(saveButton);
    });

    expect(await findByText('المستخدم المحدد ليس معلماً مؤهلاً')).toBeTruthy();
    expect(getByTestId('reassign-staff-error')).toBeTruthy();
  });

  it('displays fetch error banner when staff loading fails and retries upon pressing retry', async () => {
    jest
      .spyOn(usersApi, 'listUsersByRole')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementation((role) => {
        if (role === 'Teacher') {
          return Promise.resolve({ data: mockTeachersList });
        }
        return Promise.resolve({ data: mockAssistantsList });
      });

    const { findByTestId, getByTestId, findByText } = render(
      <StaffReassignmentPanel
        groupId={mockGroupId}
        currentTeacher={mockCurrentTeacher}
        currentAssistant={mockCurrentAssistant}
      />,
    );

    expect(await findByTestId('staff-reassign-fetch-error')).toBeTruthy();

    // Click retry button
    await act(async () => {
      fireEvent.press(getByTestId('staff-reassign-retry-button'));
    });

    expect(await findByText('الشيخ محمد الحالي')).toBeTruthy();
  });
});
