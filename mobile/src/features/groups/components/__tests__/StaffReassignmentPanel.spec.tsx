import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { StaffReassignmentPanel } from '../StaffReassignmentPanel';
import * as groupsApi from '@/shared/api/groups.client';
import * as usersApi from '@/shared/api/users.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/users.client');

describe('StaffReassignmentPanel (Figma SCR-29 Staff card + Reassign staff sheet)', () => {
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

  const mockStaffLists = () =>
    jest.spyOn(usersApi, 'listUsersByRole').mockImplementation((role) => {
      if (role === 'Teacher') {
        return Promise.resolve({ data: mockTeachersList });
      }
      return Promise.resolve({ data: mockAssistantsList });
    });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** Waits for the candidates to load, then opens the sheet. */
  async function openSheet(findByTestId: (id: string) => Promise<any>) {
    const open = await findByTestId('staff-reassign-open-button');
    await waitFor(() =>
      expect(open.props.accessibilityState.disabled).toBe(false),
    );
    await act(async () => {});
    fireEvent.press(open);
  }

  it('renders the current staff and a loading CTA while fetching the candidates', () => {
    jest
      .spyOn(usersApi, 'listUsersByRole')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId, getByText } = render(
      <StaffReassignmentPanel
        groupId={mockGroupId}
        currentTeacher={mockCurrentTeacher}
        currentAssistant={mockCurrentAssistant}
      />,
    );

    expect(getByText('الطاقم')).toBeTruthy();
    expect(getByTestId('staff-current-teacher')).toHaveTextContent(
      'الشيخ محمد الحالي',
    );
    expect(getByTestId('staff-current-assistant')).toHaveTextContent(
      'الأستاذ أحمد الحالي',
    );
    expect(getByTestId('staff-reassign-loading')).toBeTruthy();
    expect(
      getByTestId('staff-reassign-open-button').props.accessibilityState.busy,
    ).toBe(true);
  });

  it('opens the sheet with the current teacher selected and the confirm CTA disabled', async () => {
    mockStaffLists();

    const { findByTestId, getByTestId, getByText, queryByText } = render(
      <StaffReassignmentPanel
        groupId={mockGroupId}
        currentTeacher={mockCurrentTeacher}
        currentAssistant={mockCurrentAssistant}
      />,
    );

    const open = await findByTestId('staff-reassign-open-button');
    await waitFor(() =>
      expect(open.props.accessibilityState.disabled).toBe(false),
    );
    // Candidates live in the sheet only.
    expect(queryByText('الشيخ علي الجديد')).toBeNull();

    await act(async () => {});
    fireEvent.press(open);

    expect(getByTestId('reassign-staff-container')).toBeTruthy();
    expect(getByText('الشيخ علي الجديد')).toBeTruthy();
    expect(
      getByTestId('reassign-teacher-option-teacher-1').props.accessibilityState
        .selected,
    ).toBe(true);
    expect(getByText('الحالي')).toBeTruthy();

    const saveButton = getByTestId('reassign-staff-save-button');
    expect(saveButton.props.accessibilityState.disabled).toBe(true);
  });

  it('enables the confirm CTA when a new teacher is selected and calls reassignStaff with that role only', async () => {
    mockStaffLists();

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

    await openSheet(findByTestId);
    fireEvent.press(getByTestId('reassign-teacher-option-teacher-2'));

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

  it('switches to the assistant segment and submits both roles when both changed', async () => {
    mockStaffLists();

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

    const { findByTestId, getByTestId, queryByTestId } = render(
      <StaffReassignmentPanel
        groupId={mockGroupId}
        currentTeacher={mockCurrentTeacher}
        currentAssistant={mockCurrentAssistant}
        onReassigned={onReassignedMock}
      />,
    );

    await openSheet(findByTestId);
    fireEvent.press(getByTestId('reassign-teacher-option-teacher-2'));

    expect(queryByTestId('reassign-assistant-option-assistant-2')).toBeNull();
    fireEvent.press(getByTestId('reassign-staff-role-assistant'));
    fireEvent.press(getByTestId('reassign-assistant-option-assistant-2'));

    await act(async () => {
      fireEvent.press(getByTestId('reassign-staff-save-button'));
    });

    expect(reassignSpy).toHaveBeenCalledWith(mockGroupId, {
      teacher_id: 'teacher-2',
      assistant_id: 'assistant-2',
    });
    expect(onReassignedMock).toHaveBeenCalledWith(updatedGroupResponse);
  });

  it('displays the error banner inside the sheet when reassignStaff fails with 422', async () => {
    mockStaffLists();

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

    await openSheet(findByTestId);
    fireEvent.press(getByTestId('reassign-teacher-option-teacher-2'));

    await act(async () => {
      fireEvent.press(getByTestId('reassign-staff-save-button'));
    });

    expect(await findByText('المستخدم المحدد ليس معلماً مؤهلاً')).toBeTruthy();
    expect(getByTestId('reassign-staff-error')).toBeTruthy();
  });

  it('displays the fetch error banner when staff loading fails and retries upon pressing retry', async () => {
    jest
      .spyOn(usersApi, 'listUsersByRole')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementation((role) => {
        if (role === 'Teacher') {
          return Promise.resolve({ data: mockTeachersList });
        }
        return Promise.resolve({ data: mockAssistantsList });
      });

    const { findByTestId, getByTestId, queryByTestId } = render(
      <StaffReassignmentPanel
        groupId={mockGroupId}
        currentTeacher={mockCurrentTeacher}
        currentAssistant={mockCurrentAssistant}
      />,
    );

    expect(await findByTestId('staff-reassign-fetch-error')).toBeTruthy();
    expect(
      getByTestId('staff-reassign-open-button').props.accessibilityState
        .disabled,
    ).toBe(true);

    await act(async () => {
      fireEvent.press(getByTestId('staff-reassign-fetch-error-retry-button'));
    });

    expect(queryByTestId('staff-reassign-fetch-error')).toBeNull();
    const open = await findByTestId('staff-reassign-open-button');
    expect(open.props.accessibilityState.disabled).toBe(false);
  });
});
