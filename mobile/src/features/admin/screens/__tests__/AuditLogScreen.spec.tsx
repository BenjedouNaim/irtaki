import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as auditApi from '@/shared/api/audit.client';
import { ApiError, NetworkError } from '@/shared/api/types';
import { AuditLogScreen } from '../AuditLogScreen';

jest.mock('@/shared/api/audit.client');

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

function entry(
  id: string,
  action: auditApi.AuditActionName,
  full_name: string | null = `فاعل ${id}`,
): auditApi.AuditEntry {
  return {
    id,
    actor: { id: `actor-${id}`, full_name },
    action,
    target_type: action === 'LOGIN' ? null : 'Group',
    target_id: action === 'LOGIN' ? null : 'g1',
    occurred_at: '2026-09-03T08:12:00.000Z',
  };
}

const firstPage: auditApi.AuditLogResponse = {
  data: [entry('a3', 'ENROLLMENT_TOGGLED'), entry('a2', 'LOGIN', null)],
  pagination: { next_cursor: 'cursor-2', has_more: true },
};
const lastPage: auditApi.AuditLogResponse = {
  data: [entry('a1', 'GROUP_CREATED')],
  pagination: { next_cursor: null, has_more: false },
};

let queryClient: QueryClient;

function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditLogScreen />
    </QueryClientProvider>,
  );
}

describe('AuditLogScreen (SCR-33, F-ADM-03, Figma 42:566)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('opens on "الكل", asking API-054 for the unfiltered first page', async () => {
    jest.spyOn(auditApi, 'listAuditEntries').mockResolvedValue(firstPage);
    renderScreen();

    expect(screen.getByTestId('audit-log-top-bar-title').props.children).toBe(
      'سجل التدقيق',
    );
    expect(
      screen.getByTestId('audit-filter-all').props.accessibilityState.selected,
    ).toBe(true);
    expect(await screen.findByTestId('audit-entry-a3')).toBeTruthy();
    expect(auditApi.listAuditEntries).toHaveBeenCalledWith({ limit: 20 });
  });

  it('offers exactly the three audited actions plus "الكل" (APIS §9.9, RISK-08)', async () => {
    jest.spyOn(auditApi, 'listAuditEntries').mockResolvedValue(firstPage);
    renderScreen();
    await screen.findByTestId('audit-entry-a3');

    expect(screen.getByTestId('audit-filter-all')).toBeTruthy();
    expect(screen.getByTestId('audit-filter-LOGIN')).toBeTruthy();
    expect(screen.getByTestId('audit-filter-GROUP_CREATED')).toBeTruthy();
    expect(screen.getByTestId('audit-filter-ENROLLMENT_TOGGLED')).toBeTruthy();
    expect(
      screen.getByTestId('audit-log-action-filter').props.children,
    ).toHaveLength(4);
    expect(screen.getByText('3 إجراءات مسجّلة فقط')).toBeTruthy();
    expect(screen.getByText('الأحدث أولًا')).toBeTruthy();
  });

  it('shows a layout-matched skeleton before the first page arrives (UF §22)', async () => {
    let release: (page: auditApi.AuditLogResponse) => void = () => {};
    jest.spyOn(auditApi, 'listAuditEntries').mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderScreen();

    expect(screen.getByTestId('audit-log-list-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('audit-log-list-list')).toBeNull();

    release(firstPage);
    expect(await screen.findByTestId('audit-entry-a3')).toBeTruthy();
  });

  it('re-reads the log with the APIS §9.3 action filter when a chip is tapped', async () => {
    jest.spyOn(auditApi, 'listAuditEntries').mockResolvedValue(firstPage);
    renderScreen();
    await screen.findByTestId('audit-entry-a3');

    jest.spyOn(auditApi, 'listAuditEntries').mockResolvedValue(lastPage);
    fireEvent.press(screen.getByTestId('audit-filter-GROUP_CREATED'));

    await waitFor(() =>
      expect(auditApi.listAuditEntries).toHaveBeenLastCalledWith({
        action: 'GROUP_CREATED',
        limit: 20,
      }),
    );
    expect(
      screen.getByTestId('audit-filter-GROUP_CREATED').props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('loads the next page from the server cursor when the list reaches its end', async () => {
    jest
      .spyOn(auditApi, 'listAuditEntries')
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(lastPage);
    renderScreen();
    await screen.findByTestId('audit-entry-a3');

    fireEvent(screen.getByTestId('audit-log-list-list'), 'onEndReached');

    expect(await screen.findByTestId('audit-entry-a1')).toBeTruthy();
    expect(auditApi.listAuditEntries).toHaveBeenLastCalledWith({
      limit: 20,
      cursor: 'cursor-2',
    });
  });

  it('shows the factual empty state, worded for the active filter (UF §23)', async () => {
    jest.spyOn(auditApi, 'listAuditEntries').mockResolvedValue({
      data: [],
      pagination: { next_cursor: null, has_more: false },
    });
    renderScreen();
    await screen.findByTestId('audit-log-list-empty');

    expect(screen.getByText('لا إجراءات مسجّلة بعد')).toBeTruthy();

    fireEvent.press(screen.getByTestId('audit-filter-LOGIN'));
    expect(await screen.findByText('لا إجراءات من هذا النوع بعد')).toBeTruthy();
  });

  it('shows the generic Arabic copy on a 5xx, never the server message (UF §24)', async () => {
    jest.spyOn(auditApi, 'listAuditEntries').mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'relation "audit_entries" does not exist',
      }),
    );
    renderScreen();

    expect(await screen.findByTestId('audit-log-list-error')).toBeTruthy();
    expect(screen.getByText('حدث خطأ أثناء تحميل سجل التدقيق')).toBeTruthy();
    expect(
      screen.queryByText('relation "audit_entries" does not exist'),
    ).toBeNull();
  });

  it('shows the network retry copy and retries on demand (UF §24)', async () => {
    const listAuditEntries = jest
      .spyOn(auditApi, 'listAuditEntries')
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValue(firstPage);
    renderScreen();

    await screen.findByTestId('audit-log-list-error');
    expect(
      screen.getByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('audit-log-list-error-retry-button'));

    expect(await screen.findByTestId('audit-entry-a3')).toBeTruthy();
    expect(listAuditEntries).toHaveBeenCalledTimes(2);
  });
});
