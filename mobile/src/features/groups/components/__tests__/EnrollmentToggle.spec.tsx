import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { EnrollmentToggle } from '../EnrollmentToggle';
import * as groupsApi from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');

describe('EnrollmentToggle (Figma SCR-23 EnrollmentToggle row 37:160)', () => {
  const mockGroupId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the "open" state: title, caption and a checked switch', () => {
    const { getByTestId, getByText } = render(
      <EnrollmentToggle groupId={mockGroupId} enrollmentStatus="Open" />,
    );

    expect(getByTestId('enrollment-toggle')).toBeTruthy();
    expect(getByText('التسجيل مفتوح')).toBeTruthy();
    expect(
      getByText('صلاحيتك الوحيدة للكتابة — بلا تأكيد، قابلة للعكس فورًا'),
    ).toBeTruthy();
    const toggle = getByTestId('enrollment-toggle-button');
    expect(toggle.props.accessibilityRole).toBe('switch');
    expect(toggle.props.accessibilityState.checked).toBe(true);
  });

  it('renders the "closed" state with an unchecked switch', () => {
    const { getByTestId, getByText } = render(
      <EnrollmentToggle groupId={mockGroupId} enrollmentStatus="Closed" />,
    );

    expect(getByText('التسجيل مغلق')).toBeTruthy();
    expect(
      getByTestId('enrollment-toggle-button').props.accessibilityState.checked,
    ).toBe(false);
  });

  it('successfully toggles from Open to Closed and invokes onToggled', async () => {
    const onToggled = jest.fn();
    (groupsApi.toggleEnrollment as jest.Mock).mockResolvedValueOnce({
      data: {
        id: mockGroupId,
        enrollment_status: 'Closed',
      },
    });

    const { getByTestId } = render(
      <EnrollmentToggle
        groupId={mockGroupId}
        enrollmentStatus="Open"
        onToggled={onToggled}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('enrollment-toggle-button'));
    });

    expect(groupsApi.toggleEnrollment).toHaveBeenCalledWith(mockGroupId, {
      enrollment_status: 'Closed',
    });
    expect(onToggled).toHaveBeenCalledWith('Closed');
  });

  it('successfully toggles from Closed to Open and invokes onToggled', async () => {
    const onToggled = jest.fn();
    (groupsApi.toggleEnrollment as jest.Mock).mockResolvedValueOnce({
      data: {
        id: mockGroupId,
        enrollment_status: 'Open',
      },
    });

    const { getByTestId } = render(
      <EnrollmentToggle
        groupId={mockGroupId}
        enrollmentStatus="Closed"
        onToggled={onToggled}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('enrollment-toggle-button'));
    });

    expect(groupsApi.toggleEnrollment).toHaveBeenCalledWith(mockGroupId, {
      enrollment_status: 'Open',
    });
    expect(onToggled).toHaveBeenCalledWith('Open');
  });

  it('shows the icon + text error when the toggle fails with 403 Forbidden', async () => {
    (groupsApi.toggleEnrollment as jest.Mock).mockRejectedValueOnce(
      new ApiError({
        statusCode: 403,
        error: 'Forbidden',
        message: 'غير مصرح لك بتعديل حالة التسجيل لهذه الحلقة',
      }),
    );

    const { getByTestId, findByText, getByLabelText } = render(
      <EnrollmentToggle groupId={mockGroupId} enrollmentStatus="Open" />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('enrollment-toggle-button'));
    });

    expect(
      await findByText('غير مصرح لك بتعديل حالة التسجيل لهذه الحلقة'),
    ).toBeTruthy();
    expect(getByTestId('enrollment-toggle-error')).toBeTruthy();
    expect(getByLabelText('تنبيه')).toBeTruthy();
  });

  it('shows field error message when toggle fails with 422 and details', async () => {
    (groupsApi.toggleEnrollment as jest.Mock).mockRejectedValueOnce(
      new ApiError({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'بيانات غير صالحة',
        details: [
          {
            field: 'enrollment_status',
            rule: 'VR-XX',
            message: 'حالة التسجيل غير صالحة',
          },
        ],
      }),
    );

    const { getByTestId, findByText } = render(
      <EnrollmentToggle groupId={mockGroupId} enrollmentStatus="Open" />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('enrollment-toggle-button'));
    });

    expect(await findByText('حالة التسجيل غير صالحة')).toBeTruthy();
    expect(getByTestId('enrollment-toggle-error')).toBeTruthy();
  });

  it('shows network error message on non-ApiError rejection', async () => {
    (groupsApi.toggleEnrollment as jest.Mock).mockRejectedValueOnce(
      new Error('Network failure'),
    );

    const { getByTestId, findByText } = render(
      <EnrollmentToggle groupId={mockGroupId} enrollmentStatus="Closed" />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('enrollment-toggle-button'));
    });

    expect(
      await findByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();
    expect(getByTestId('enrollment-toggle-error')).toBeTruthy();
  });
});
