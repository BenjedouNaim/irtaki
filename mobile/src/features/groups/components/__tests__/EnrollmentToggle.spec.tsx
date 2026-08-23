import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { EnrollmentToggle } from '../EnrollmentToggle';
import * as groupsApi from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');

describe('EnrollmentToggle component', () => {
  const mockGroupId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when enrollment status is Open', () => {
    const { getByTestId, getByText } = render(
      <EnrollmentToggle groupId={mockGroupId} enrollmentStatus="Open" />,
    );

    expect(getByTestId('enrollment-toggle')).toBeTruthy();
    expect(getByTestId('enrollment-toggle-badge')).toBeTruthy();
    expect(getByText('مفتوح للتسجيل')).toBeTruthy();
    expect(getByTestId('enrollment-toggle-button')).toBeTruthy();
    expect(getByText('إغلاق التسجيل')).toBeTruthy();
  });

  it('renders correctly when enrollment status is Closed', () => {
    const { getByTestId, getByText } = render(
      <EnrollmentToggle groupId={mockGroupId} enrollmentStatus="Closed" />,
    );

    expect(getByTestId('enrollment-toggle')).toBeTruthy();
    expect(getByTestId('enrollment-toggle-badge')).toBeTruthy();
    expect(getByText('مغلق للتسجيل')).toBeTruthy();
    expect(getByTestId('enrollment-toggle-button')).toBeTruthy();
    expect(getByText('فتح التسجيل')).toBeTruthy();
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

  it('shows error message when toggle fails with 403 Forbidden', async () => {
    (groupsApi.toggleEnrollment as jest.Mock).mockRejectedValueOnce(
      new ApiError({
        statusCode: 403,
        error: 'Forbidden',
        message: 'غير مصرح لك بتعديل حالة التسجيل لهذه الحلقة',
      }),
    );

    const { getByTestId, findByText } = render(
      <EnrollmentToggle groupId={mockGroupId} enrollmentStatus="Open" />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('enrollment-toggle-button'));
    });

    expect(
      await findByText('غير مصرح لك بتعديل حالة التسجيل لهذه الحلقة'),
    ).toBeTruthy();
    expect(getByTestId('enrollment-toggle-error')).toBeTruthy();
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
