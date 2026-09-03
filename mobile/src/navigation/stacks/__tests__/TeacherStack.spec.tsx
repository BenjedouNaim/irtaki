import React from 'react';
import {
  render as rtlRender,
  screen,
  fireEvent,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeacherStack } from '../TeacherStack';
import * as dashboardApi from '@/shared/api/dashboard.client';
import * as groupsApi from '@/shared/api/groups.client';
import { METRIC_TILE_NULL_VALUE } from '@/shared/components/MetricTile';
import { ApiError, NetworkError } from '@/shared/api/types';

jest.mock('@/shared/api/dashboard.client');
jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/auth.client');

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const GROUP_ID = '11111111-1111-1111-1111-111111111111';

const teacherDashboard: dashboardApi.TeacherDashboardDto = {
  groups: [
    {
      id: GROUP_ID,
      name: 'حلقة الإمام قالون',
      commitment_average: 78.4,
      at_risk_count: 3,
      submission_rate: 83.2,
    },
  ],
};

let queryClient: QueryClient;

function render(ui: React.ReactElement) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return rtlRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('TeacherStack (SCR-22 Teacher Home, Figma 37:2 / 37:83)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders a GroupCard per assigned group with its three figures, from ONE call', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockResolvedValue(teacherDashboard);

    render(<TeacherStack />);

    expect(screen.getByTestId('teacher-stack')).toBeTruthy();
    expect(screen.getByTestId('teacher-top-bar-title').props.children).toBe(
      'مجموعاتي',
    );
    expect(screen.getByTestId('teacher-groups-skeleton')).toBeTruthy();

    const row = await screen.findByTestId(`teacher-group-row-${GROUP_ID}`);
    expect(screen.getByText('حلقة الإمام قالون')).toBeTruthy();
    expect(
      screen.getByTestId(`teacher-group-row-${GROUP_ID}-average-value`).props
        .children,
    ).toBe('78%');
    expect(
      screen.getByTestId(`teacher-group-row-${GROUP_ID}-at-risk-value`).props
        .children,
    ).toBe('3');
    expect(
      screen.getByTestId(`teacher-group-row-${GROUP_ID}-submission-value`).props
        .children,
    ).toBe('83%');
    expect(screen.getByTestId('teacher-greeting').props.children).toBe(
      'معلّم · مجموعة واحدة · الأسبوع الحالي',
    );

    expect(dashboardApi.getMyDashboard).toHaveBeenCalledTimes(1);
    // F-DASH-03: the dashboard already names the assigned groups.
    expect(groupsApi.listGroups).not.toHaveBeenCalled();

    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/teacher/groups/[id]/roster',
      params: { id: GROUP_ID },
    });
  });

  it('renders a null rate as the null state, never 0% (DEC-B04)', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      groups: [
        {
          id: GROUP_ID,
          name: 'حلقة جديدة',
          commitment_average: null,
          at_risk_count: 0,
          submission_rate: null,
        },
      ],
    });

    render(<TeacherStack />);

    await screen.findByTestId(`teacher-group-row-${GROUP_ID}`);
    expect(
      screen.getByTestId(`teacher-group-row-${GROUP_ID}-average-value`).props
        .children,
    ).toBe(METRIC_TILE_NULL_VALUE);
    expect(
      screen.getByTestId(`teacher-group-row-${GROUP_ID}-submission-value`).props
        .children,
    ).toBe(METRIC_TILE_NULL_VALUE);
    // A genuine count of zero IS zero.
    expect(
      screen.getByTestId(`teacher-group-row-${GROUP_ID}-at-risk-value`).props
        .children,
    ).toBe('0');
  });

  it('shows the Figma empty state with no CTA (UF §23)', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockResolvedValue({ groups: [] });

    render(<TeacherStack />);

    expect(await screen.findByTestId('teacher-groups-empty')).toBeTruthy();
    expect(screen.getByText('لم تُسند إليك أي مجموعة بعد')).toBeTruthy();
    expect(screen.queryByTestId('teacher-groups-list')).toBeNull();
  });

  it('shows the generic retry banner on a 5xx, never the server string, and retries (UF §24)', async () => {
    const spy = jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'FATAL: relation "groups" does not exist',
        }),
      )
      .mockResolvedValueOnce(teacherDashboard);

    render(<TeacherStack />);

    const banner = await screen.findByTestId('teacher-groups-error');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
    expect(
      screen.getByTestId('teacher-groups-error-message').props.children,
    ).toBe('حدث خطأ أثناء تحميل الصفحة الرئيسية');
    expect(screen.queryByText(/relation/)).toBeNull();

    fireEvent.press(screen.getByTestId('teacher-groups-error-retry-button'));

    expect(
      await screen.findByTestId(`teacher-group-row-${GROUP_ID}`),
    ).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('shows the shared connectivity copy on a network failure', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockRejectedValue(new NetworkError('Network request failed'));

    render(<TeacherStack />);

    expect(await screen.findByTestId('teacher-groups-error')).toBeTruthy();
    expect(
      screen.getByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();
  });

  it('keeps the profile entry point', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockResolvedValue({ groups: [] });

    render(<TeacherStack />);
    await screen.findByTestId('teacher-groups-empty');

    fireEvent.press(screen.getByTestId('profile-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });
});
