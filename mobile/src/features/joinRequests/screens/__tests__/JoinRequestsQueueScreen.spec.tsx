import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { JoinRequestsQueueScreen } from '../JoinRequestsQueueScreen';
import * as joinRequestsApi from '@/shared/api/joinRequests.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/joinRequests.client');

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('JoinRequestsQueueScreen (SCR-18 / F-ENR-03)', () => {
  const mockQueueItems: joinRequestsApi.JoinRequestQueueItem[] = [
    {
      id: 'jr-1111-1111-1111-1111',
      full_name: 'أحمد التونسي',
      score: 95.5,
      created_at: '2026-08-20T10:00:00.000Z',
    },
    {
      id: 'jr-2222-2222-2222-2222',
      full_name: 'محمد الفاسي',
      score: 80.0,
      created_at: '2026-08-21T11:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton on initial mount', async () => {
    jest
      .spyOn(joinRequestsApi, 'listPendingJoinRequests')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId, queryByTestId } = render(<JoinRequestsQueueScreen />);

    expect(getByTestId('join-requests-skeleton')).toBeTruthy();
    expect(queryByTestId('join-requests-content')).toBeNull();
    expect(queryByTestId('join-requests-empty')).toBeNull();
    expect(queryByTestId('join-requests-error')).toBeNull();
  });

  it('renders populated list with join request cards when API succeeds', async () => {
    jest
      .spyOn(joinRequestsApi, 'listPendingJoinRequests')
      .mockResolvedValueOnce({
        data: mockQueueItems,
        pagination: {
          next_cursor: null,
          has_more: false,
        },
      });

    const { getByTestId, getByText, findByText, queryByTestId } = render(
      <JoinRequestsQueueScreen />,
    );

    // Screen title and elements
    expect(getByTestId('join-requests-queue-screen')).toBeTruthy();
    expect(await findByText('أحمد التونسي')).toBeTruthy();
    expect(getByTestId('join-requests-top-bar-title')).toHaveTextContent(
      'طلبات الانضمام',
    );
    expect(queryByTestId('join-requests-skeleton')).toBeNull();

    // Head: fixed score order, count with Arabic agreement (Figma 34:143)
    expect(getByTestId('join-requests-count')).toHaveTextContent(
      'طلبان معلّقان',
    );
    expect(getByText('ترتيب ثابت: الأعلى نقاطًا أولًا')).toBeTruthy();

    // Assistant tab bar: queue active, every tab live since F-PAY-02
    expect(
      getByTestId('assistant-tab-bar-join-requests').props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      getByTestId('assistant-tab-bar-payments').props.accessibilityState
        .disabled,
    ).toBeUndefined();

    // Item 1
    expect(getByTestId('join-request-row-jr-1111-1111-1111-1111')).toBeTruthy();
    expect(
      getByTestId('join-request-name-jr-1111-1111-1111-1111'),
    ).toHaveTextContent('أحمد التونسي');
    expect(
      getByTestId('join-request-score-jr-1111-1111-1111-1111'),
    ).toHaveTextContent('95.5');
    expect(
      getByTestId('join-request-created-at-jr-1111-1111-1111-1111'),
    ).toHaveTextContent('قُدِّم في 2026-08-20');

    // Item 2
    expect(getByTestId('join-request-row-jr-2222-2222-2222-2222')).toBeTruthy();
    expect(
      getByTestId('join-request-name-jr-2222-2222-2222-2222'),
    ).toHaveTextContent('محمد الفاسي');
    expect(
      getByTestId('join-request-score-jr-2222-2222-2222-2222'),
    ).toHaveTextContent('80');
    expect(
      getByTestId('join-request-created-at-jr-2222-2222-2222-2222'),
    ).toHaveTextContent('قُدِّم في 2026-08-21');
  });

  it('renders empty state when listPendingJoinRequests returns empty array', async () => {
    jest
      .spyOn(joinRequestsApi, 'listPendingJoinRequests')
      .mockResolvedValueOnce({
        data: [],
        pagination: {
          next_cursor: null,
          has_more: false,
        },
      });

    const { getByTestId, findByText, queryByTestId } = render(
      <JoinRequestsQueueScreen />,
    );

    expect(await findByText('لا توجد طلبات معلّقة')).toBeTruthy();
    expect(getByTestId('join-requests-empty')).toBeTruthy();
    expect(queryByTestId('join-requests-content')).toBeNull();
    expect(queryByTestId('join-requests-skeleton')).toBeNull();
  });

  it('renders error banner when API fails with ApiError and recovers upon retry', async () => {
    jest
      .spyOn(joinRequestsApi, 'listPendingJoinRequests')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'خطأ في جلب طلبات الانضمام',
        }),
      )
      .mockResolvedValueOnce({
        data: mockQueueItems,
        pagination: {
          next_cursor: null,
          has_more: false,
        },
      });

    const { getByTestId, findByText, queryByTestId } = render(
      <JoinRequestsQueueScreen />,
    );

    expect(await findByText('خطأ في جلب طلبات الانضمام')).toBeTruthy();
    expect(getByTestId('join-requests-error')).toBeTruthy();
    expect(queryByTestId('join-requests-content')).toBeNull();

    // Tap retry
    await act(async () => {
      fireEvent.press(getByTestId('join-requests-error-retry-button'));
    });

    expect(await findByText('أحمد التونسي')).toBeTruthy();
    expect(queryByTestId('join-requests-error')).toBeNull();
    expect(getByTestId('join-requests-content')).toBeTruthy();
    expect(joinRequestsApi.listPendingJoinRequests).toHaveBeenCalledTimes(2);
  });

  it('renders generic network error when API fails with standard Error', async () => {
    jest
      .spyOn(joinRequestsApi, 'listPendingJoinRequests')
      .mockRejectedValueOnce(new Error('Network error'));

    const { getByTestId, findByText } = render(<JoinRequestsQueueScreen />);

    expect(
      await findByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();
    expect(getByTestId('join-requests-error')).toBeTruthy();
  });

  it('navigates to applicant detail when tapping a queue row', async () => {
    jest
      .spyOn(joinRequestsApi, 'listPendingJoinRequests')
      .mockResolvedValueOnce({
        data: mockQueueItems,
        pagination: {
          next_cursor: null,
          has_more: false,
        },
      });

    const { getByTestId, findByText } = render(<JoinRequestsQueueScreen />);

    expect(await findByText('أحمد التونسي')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('join-request-row-jr-1111-1111-1111-1111'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/assistant/join-requests/[id]',
      params: { id: 'jr-1111-1111-1111-1111' },
    });
  });

  it('loads more items when tapping load more button during pagination', async () => {
    const page1Item: joinRequestsApi.JoinRequestQueueItem = {
      id: 'jr-page1',
      full_name: 'طالب الصفحة الأولى',
      score: 90.0,
      created_at: '2026-08-20T10:00:00.000Z',
    };

    const page2Item: joinRequestsApi.JoinRequestQueueItem = {
      id: 'jr-page2',
      full_name: 'طالب الصفحة الثانية',
      score: 70.0,
      created_at: '2026-08-21T10:00:00.000Z',
    };

    jest
      .spyOn(joinRequestsApi, 'listPendingJoinRequests')
      .mockResolvedValueOnce({
        data: [page1Item],
        pagination: {
          next_cursor: 'cursor-page-2',
          has_more: true,
        },
      })
      .mockResolvedValueOnce({
        data: [page2Item],
        pagination: {
          next_cursor: null,
          has_more: false,
        },
      });

    const { getByTestId, findByText, queryByTestId } = render(
      <JoinRequestsQueueScreen />,
    );

    expect(await findByText('طالب الصفحة الأولى')).toBeTruthy();
    expect(getByTestId('load-more-button')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('load-more-button'));
    });

    expect(await findByText('طالب الصفحة الثانية')).toBeTruthy();
    expect(getByTestId('join-request-row-jr-page1')).toBeTruthy();
    expect(getByTestId('join-request-row-jr-page2')).toBeTruthy();
    expect(queryByTestId('load-more-button')).toBeNull();
  });

  it('returns to Assistant Home from the tab bar', async () => {
    jest
      .spyOn(joinRequestsApi, 'listPendingJoinRequests')
      .mockResolvedValueOnce({
        data: mockQueueItems,
        pagination: {
          next_cursor: null,
          has_more: false,
        },
      });

    const { getByTestId, findByText } = render(<JoinRequestsQueueScreen />);
    expect(await findByText('أحمد التونسي')).toBeTruthy();

    fireEvent.press(getByTestId('assistant-tab-bar-home'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/assistant');

    // The Payments tab is live since F-PAY-02, and sits at the same stack
    // depth as the queue, so switching replaces rather than deepens.
    fireEvent.press(getByTestId('assistant-tab-bar-payments'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/assistant/payments');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
