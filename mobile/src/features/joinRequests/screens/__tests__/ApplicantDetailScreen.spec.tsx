import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ApplicantDetailScreen } from '../ApplicantDetailScreen';
import * as joinRequestsApi from '@/shared/api/joinRequests.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/joinRequests.client');

const mockBack = jest.fn();
let mockParams = { id: 'jr-1111-1111-1111-1111' };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
  useLocalSearchParams: () => mockParams,
}));

describe('ApplicantDetailScreen (SCR-19 / F-ENR-04)', () => {
  const mockApplicant: joinRequestsApi.ApplicantProfile = {
    id: 'jr-1111-1111-1111-1111',
    full_name: 'أحمد التونسي',
    gender: 'Male',
    age: 26,
    phone_number: '+21698123456',
    occupation: 'مهندس برمجيات',
    city: 'تونس العاصمة',
    memorized_ahzab: [1, 2, 3, 4, 5, 6, 7, 8],
    tajweed_level: 'Intermediate',
    studied_tajweed_theory: true,
    studied_qalun: true,
    fee_agreement: true,
    program_goal: 'Memorization',
    score: 87.5,
    status: 'Pending',
    created_at: '2026-08-20T10:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: 'jr-1111-1111-1111-1111' };
  });

  it('renders loading skeleton on initial mount', async () => {
    jest
      .spyOn(joinRequestsApi, 'getJoinRequestDetail')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId, queryByTestId } = render(<ApplicantDetailScreen />);

    expect(getByTestId('applicant-detail-skeleton')).toBeTruthy();
    expect(queryByTestId('applicant-detail-content')).toBeNull();
    expect(queryByTestId('applicant-detail-error')).toBeNull();
  });

  it('renders complete applicant profile card with all fields and ahzab grid when API succeeds', async () => {
    jest.spyOn(joinRequestsApi, 'getJoinRequestDetail').mockResolvedValueOnce({
      data: mockApplicant,
    });

    const { getByTestId, findByText, queryByTestId } = render(
      <ApplicantDetailScreen />,
    );

    expect(getByTestId('applicant-detail-screen')).toBeTruthy();
    expect(await findByText('الملف الشخصي للمتقدم')).toBeTruthy();
    expect(queryByTestId('applicant-detail-skeleton')).toBeNull();

    // Profile card elements
    expect(getByTestId('applicant-profile-card')).toBeTruthy();
    expect(getByTestId('applicant-full-name')).toHaveTextContent(
      'أحمد التونسي',
    );
    expect(getByTestId('applicant-score')).toHaveTextContent('87.5');
    expect(getByTestId('applicant-status-badge')).toHaveTextContent(
      'قيد المراجعة',
    );

    // Individual fields
    expect(getByTestId('field-full-name')).toHaveTextContent('أحمد التونسي');
    expect(getByTestId('field-gender')).toHaveTextContent('ذكر');
    expect(getByTestId('field-age')).toHaveTextContent('26 سنة');
    expect(getByTestId('field-phone')).toHaveTextContent('+21698123456');
    expect(getByTestId('field-city')).toHaveTextContent('تونس العاصمة');
    expect(getByTestId('field-occupation')).toHaveTextContent('مهندس برمجيات');
    expect(getByTestId('field-tajweed-level')).toHaveTextContent('متوسط');
    expect(getByTestId('field-tajweed-theory')).toHaveTextContent('نعم');
    expect(getByTestId('field-studied-qalun')).toHaveTextContent('نعم');
    expect(getByTestId('field-program-goal')).toHaveTextContent(
      'حفظ القرآن الكريم',
    );
    expect(getByTestId('field-fee-agreement')).toHaveTextContent(
      'نعم (تمت الموافقة)',
    );
    expect(getByTestId('field-created-at')).toHaveTextContent('2026-08-20');

    // Ahzab section
    expect(getByTestId('applicant-ahzab-section')).toBeTruthy();
    expect(getByTestId('applicant-ahzab-count')).toHaveTextContent('8 حزباً');
    expect(getByTestId('applicant-ahzab-grid')).toBeTruthy();
  });

  it('positively asserts email is never rendered anywhere in the component (APIQ-04)', async () => {
    jest.spyOn(joinRequestsApi, 'getJoinRequestDetail').mockResolvedValueOnce({
      data: mockApplicant,
    });

    const { queryByText, findByTestId } = render(<ApplicantDetailScreen />);

    await findByTestId('applicant-full-name');

    expect(queryByText(/@/)).toBeNull();
    expect(queryByText(/email/i)).toBeNull();
    expect(queryByText(/البريد/)).toBeNull();
    expect(queryByText(/الإلكتروني/)).toBeNull();
  });

  it('renders error banner when API fails with ApiError and recovers upon retry', async () => {
    jest
      .spyOn(joinRequestsApi, 'getJoinRequestDetail')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'خطأ في جلب تفاصيل طلب الانضمام',
        }),
      )
      .mockResolvedValueOnce({
        data: mockApplicant,
      });

    const { getByTestId, findByText, findByTestId, queryByTestId } = render(
      <ApplicantDetailScreen />,
    );

    expect(await findByText('خطأ في جلب تفاصيل طلب الانضمام')).toBeTruthy();
    expect(getByTestId('applicant-detail-error')).toBeTruthy();
    expect(queryByTestId('applicant-detail-content')).toBeNull();

    // Tap retry
    await act(async () => {
      fireEvent.press(getByTestId('retry-button'));
    });

    expect(await findByTestId('applicant-full-name')).toBeTruthy();
    expect(queryByTestId('applicant-detail-error')).toBeNull();
    expect(getByTestId('applicant-detail-content')).toBeTruthy();
    expect(joinRequestsApi.getJoinRequestDetail).toHaveBeenCalledTimes(2);
  });

  it('renders uniform error state when API fails with 403 Forbidden (NFR-20)', async () => {
    jest.spyOn(joinRequestsApi, 'getJoinRequestDetail').mockRejectedValueOnce(
      new ApiError({
        statusCode: 403,
        error: 'Forbidden',
        message: 'ليس لديك صلاحية لعرض هذا الطلب',
      }),
    );

    const { getByTestId, findByText, queryByTestId } = render(
      <ApplicantDetailScreen />,
    );

    expect(await findByText('ليس لديك صلاحية لعرض هذا الطلب')).toBeTruthy();
    expect(getByTestId('applicant-detail-error')).toBeTruthy();
    expect(queryByTestId('applicant-detail-content')).toBeNull();
  });

  it('handles back button press by calling router.back()', async () => {
    jest.spyOn(joinRequestsApi, 'getJoinRequestDetail').mockResolvedValueOnce({
      data: mockApplicant,
    });

    const { getByTestId, findByTestId } = render(<ApplicantDetailScreen />);

    await findByTestId('applicant-full-name');

    fireEvent.press(getByTestId('back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('renders error when requestId param is missing', async () => {
    mockParams = { id: '' };

    const { getByTestId, findByText, queryByTestId } = render(
      <ApplicantDetailScreen />,
    );

    expect(await findByText('معرف طلب الانضمام غير صالح')).toBeTruthy();
    expect(getByTestId('applicant-detail-error')).toBeTruthy();
    expect(queryByTestId('applicant-detail-content')).toBeNull();
  });

  describe('Accept Join Request flow (SCR-19 / F-ENR-05)', () => {
    it('renders Accept button when applicant status is Pending', async () => {
      jest
        .spyOn(joinRequestsApi, 'getJoinRequestDetail')
        .mockResolvedValueOnce({
          data: mockApplicant,
        });

      const { findByTestId } = render(<ApplicantDetailScreen />);

      expect(await findByTestId('applicant-actions-card')).toBeTruthy();
      expect(await findByTestId('accept-join-request-button')).toBeTruthy();
    });

    it('does NOT render Accept button when applicant status is Accepted or Rejected', async () => {
      jest
        .spyOn(joinRequestsApi, 'getJoinRequestDetail')
        .mockResolvedValueOnce({
          data: {
            ...mockApplicant,
            status: 'Accepted',
          },
        });

      const { findByTestId, queryByTestId } = render(<ApplicantDetailScreen />);

      await findByTestId('applicant-full-name');
      expect(queryByTestId('applicant-actions-card')).toBeNull();
      expect(queryByTestId('accept-join-request-button')).toBeNull();
    });

    it('opens confirmation dialog on Accept button press and closes on cancel without calling API', async () => {
      jest
        .spyOn(joinRequestsApi, 'getJoinRequestDetail')
        .mockResolvedValueOnce({
          data: mockApplicant,
        });
      const acceptSpy = jest.spyOn(joinRequestsApi, 'acceptJoinRequest');

      const { findByTestId, getByTestId } = render(<ApplicantDetailScreen />);

      const acceptButton = await findByTestId('accept-join-request-button');
      fireEvent.press(acceptButton);

      expect(getByTestId('accept-confirm-dialog')).toBeTruthy();
      expect(getByTestId('accept-confirm-dialog-title')).toHaveTextContent(
        'قبول طلب الانضمام',
      );

      // Cancel dialog
      fireEvent.press(getByTestId('accept-confirm-dialog-cancel-button'));
      expect(acceptSpy).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('calls acceptJoinRequest on confirm and navigates back on success', async () => {
      jest
        .spyOn(joinRequestsApi, 'getJoinRequestDetail')
        .mockResolvedValueOnce({
          data: mockApplicant,
        });
      const acceptSpy = jest
        .spyOn(joinRequestsApi, 'acceptJoinRequest')
        .mockResolvedValueOnce({
          data: {
            membership_id: 'mem-1111-1111-1111-1111',
          },
        });

      const { findByTestId, getByTestId } = render(<ApplicantDetailScreen />);

      const acceptButton = await findByTestId('accept-join-request-button');
      fireEvent.press(acceptButton);

      await act(async () => {
        fireEvent.press(getByTestId('accept-confirm-dialog-confirm-button'));
      });

      expect(acceptSpy).toHaveBeenCalledWith(mockApplicant.id);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('renders error banner for 409 ALREADY_DECIDED error and does not navigate back', async () => {
      jest
        .spyOn(joinRequestsApi, 'getJoinRequestDetail')
        .mockResolvedValueOnce({
          data: mockApplicant,
        });
      jest.spyOn(joinRequestsApi, 'acceptJoinRequest').mockRejectedValueOnce(
        new ApiError({
          statusCode: 409,
          error: 'ALREADY_DECIDED',
          message: 'تم اتخاذ قرار بشأن هذا الطلب مسبقاً',
        }),
      );

      const { findByTestId, getByTestId, findByText } = render(
        <ApplicantDetailScreen />,
      );

      const acceptButton = await findByTestId('accept-join-request-button');
      fireEvent.press(acceptButton);

      await act(async () => {
        fireEvent.press(getByTestId('accept-confirm-dialog-confirm-button'));
      });

      expect(
        await findByText('تم اتخاذ قرار بشأن هذا الطلب مسبقاً'),
      ).toBeTruthy();
      expect(getByTestId('accept-action-error')).toBeTruthy();
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('renders error banner for 409 APPLICANT_NO_LONGER_ELIGIBLE error', async () => {
      jest
        .spyOn(joinRequestsApi, 'getJoinRequestDetail')
        .mockResolvedValueOnce({
          data: mockApplicant,
        });
      jest.spyOn(joinRequestsApi, 'acceptJoinRequest').mockRejectedValueOnce(
        new ApiError({
          statusCode: 409,
          error: 'APPLICANT_NO_LONGER_ELIGIBLE',
          message: 'المتقدم مسجل بالفعل في حلقة نشطة أخرى',
        }),
      );

      const { findByTestId, getByTestId, findByText } = render(
        <ApplicantDetailScreen />,
      );

      const acceptButton = await findByTestId('accept-join-request-button');
      fireEvent.press(acceptButton);

      await act(async () => {
        fireEvent.press(getByTestId('accept-confirm-dialog-confirm-button'));
      });

      expect(
        await findByText('المتقدم مسجل بالفعل في حلقة نشطة أخرى'),
      ).toBeTruthy();
      expect(getByTestId('accept-action-error')).toBeTruthy();
      expect(mockBack).not.toHaveBeenCalled();
    });
  });
});
