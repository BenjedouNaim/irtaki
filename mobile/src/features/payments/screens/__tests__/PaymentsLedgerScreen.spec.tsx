import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as groupsApi from '@/shared/api/groups.client';
import * as paymentsApi from '@/shared/api/payments.client';
import { ApiError, NetworkError } from '@/shared/api/types';
import {
  PaymentsLedgerScreen,
  NO_STUDENTS_MESSAGE,
  NO_STUDENTS_WITH_STATUS_MESSAGE,
} from '../PaymentsLedgerScreen';

jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/payments.client');

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

const NEVER = () => new Promise<never>(() => {});

const GENERIC_SERVER_MESSAGE = 'حدث خطأ أثناء تحميل سجلّ المدفوعات';
const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

function group(id: string, name: string): groupsApi.GroupListItemFull {
  return {
    id,
    name,
    gender: 'Male',
    recitation_day: 4,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    teacher: { id: 't-1', full_name: 'المعلّم' },
    assistant: { id: 'a-1', full_name: 'المساعد' },
  };
}

const paidStudent: paymentsApi.GroupStudentLedgerDto = {
  membership_id: 'm-paid',
  full_name: 'أحمد الطرابلسي',
  cycles: [
    {
      index: 0,
      start_date: '2026-07-01',
      end_date: '2026-09-30',
      status: 'Paid',
      paid_at: '2026-07-12T09:00:00.000Z',
    },
  ],
  next_due_date: null,
  arrears_count: 0,
};

const arrearsStudent: paymentsApi.GroupStudentLedgerDto = {
  membership_id: 'm-unpaid',
  full_name: 'يوسف بن سالم',
  cycles: [
    {
      index: 0,
      start_date: '2026-01-01',
      end_date: '2026-03-31',
      status: 'Unpaid',
    },
    {
      index: 1,
      start_date: '2026-04-01',
      end_date: '2026-06-30',
      status: 'Unpaid',
    },
    {
      index: 2,
      start_date: '2026-07-01',
      end_date: '2026-09-30',
      status: 'Unpaid',
    },
  ],
  next_due_date: '2026-03-31',
  arrears_count: 2,
};

let queryClient: QueryClient;

function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentsLedgerScreen />
    </QueryClientProvider>,
  );
}

describe('PaymentsLedgerScreen (SCR-20, F-PAY-02, Figma 36:401 / 53:747)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (groupsApi.listGroups as jest.Mock).mockResolvedValue({
      data: [group('g-1', 'حلقة الفجر')],
    });
    (paymentsApi.getGroupPayments as jest.Mock).mockResolvedValue([
      paidStudent,
      arrearsStudent,
    ]);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders a layout-matched skeleton on first load (UF §22)', () => {
    (groupsApi.listGroups as jest.Mock).mockImplementation(NEVER);

    renderScreen();

    expect(screen.getByTestId('payments-ledger-skeleton')).toBeTruthy();
    expect(
      screen.getByTestId('payments-ledger-skeleton-selector'),
    ).toBeTruthy();
    expect(screen.getByTestId('payments-ledger-skeleton-rows')).toBeTruthy();
    expect(screen.queryByTestId('payments-ledger-content')).toBeNull();
  });

  it('renders the tab-root TopBar without a back control and the Payments tab active (UF §31)', async () => {
    renderScreen();

    await screen.findByTestId('payments-ledger-content');
    expect(screen.queryByTestId('payments-ledger-top-bar-back')).toBeNull();
    expect(
      screen.getByTestId('assistant-tab-bar-payments').props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('reads the first assigned group with no status filter — the "All" chip', async () => {
    renderScreen();

    await screen.findByTestId('payments-ledger-content');
    expect(paymentsApi.getGroupPayments).toHaveBeenCalledWith('g-1', {
      status: undefined,
    });
    expect(
      screen.getByTestId('payments-ledger-filter-all').props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('renders one row per student with the current-cycle badge, and the arrears badge only above zero (UF §18)', async () => {
    renderScreen();

    await screen.findByTestId('payments-ledger-list');
    expect(
      screen.getByTestId('payment-ledger-row-m-paid-name'),
    ).toHaveTextContent('أحمد الطرابلسي');
    expect(
      screen.getByTestId('payment-ledger-row-m-paid-status'),
    ).toHaveTextContent('مدفوع');
    expect(
      screen.queryByTestId('payment-ledger-row-m-paid-arrears'),
    ).toBeNull();

    expect(
      screen.getByTestId('payment-ledger-row-m-unpaid-status'),
    ).toHaveTextContent('غير مدفوع');
    expect(
      screen.getByTestId('payment-ledger-row-m-unpaid-arrears'),
    ).toHaveTextContent('2 متأخرة');
  });

  it('shows the current cycle end date under the name (Figma 36:459)', async () => {
    renderScreen();

    await screen.findByTestId('payments-ledger-list');
    expect(
      screen.getByTestId('payment-ledger-row-m-paid-current-cycle'),
    ).toHaveTextContent('الدورة الحالية · 30 سبتمبر');
  });

  it('offers exactly the four Figma chips — no fourth status exists (BR-55)', async () => {
    renderScreen();

    await screen.findByTestId('payments-ledger-filters');
    expect(screen.getByTestId('payments-ledger-filter-all')).toHaveTextContent(
      'الكل',
    );
    expect(screen.getByTestId('payments-ledger-filter-paid')).toHaveTextContent(
      'مدفوع',
    );
    expect(
      screen.getByTestId('payments-ledger-filter-due-soon'),
    ).toHaveTextContent('يستحق قريبًا');
    expect(
      screen.getByTestId('payments-ledger-filter-unpaid'),
    ).toHaveTextContent('غير مدفوع');
  });

  it('re-reads the endpoint with ?status= when a chip is pressed (FR-PAY-06 — the server filters, not the client)', async () => {
    renderScreen();
    await screen.findByTestId('payments-ledger-content');

    (paymentsApi.getGroupPayments as jest.Mock).mockResolvedValue([
      arrearsStudent,
    ]);
    fireEvent.press(screen.getByTestId('payments-ledger-filter-unpaid'));

    await waitFor(() =>
      expect(paymentsApi.getGroupPayments).toHaveBeenCalledWith('g-1', {
        status: 'Unpaid',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('payment-ledger-row-m-paid')).toBeNull(),
    );
    expect(
      screen.getByTestId('payments-ledger-filter-unpaid').props
        .accessibilityState.selected,
    ).toBe(true);
  });

  it('shows the filtered-empty state while the selector keeps summarising the whole group (Figma 53:747)', async () => {
    renderScreen();
    await screen.findByTestId('payments-ledger-content');

    (paymentsApi.getGroupPayments as jest.Mock).mockResolvedValue([]);
    fireEvent.press(screen.getByTestId('payments-ledger-filter-due-soon'));

    expect(
      await screen.findByTestId('payments-ledger-empty'),
    ).toHaveTextContent(NO_STUDENTS_WITH_STATUS_MESSAGE);
    // The summary still reads the unfiltered slice: 2 students, 1 in arrears.
    expect(
      screen.getByTestId('payments-group-selector-summary'),
    ).toHaveTextContent('طالبان · متابعة واحدة');
  });

  it('shows the "no students in this group" state when the unfiltered ledger is empty (UF §18)', async () => {
    (paymentsApi.getGroupPayments as jest.Mock).mockResolvedValue([]);

    renderScreen();

    expect(
      await screen.findByTestId('payments-ledger-empty'),
    ).toHaveTextContent(NO_STUDENTS_MESSAGE);
  });

  it('shows the UF §23 line and no ledger when nothing is assigned to the Assistant', async () => {
    (groupsApi.listGroups as jest.Mock).mockResolvedValue({ data: [] });

    renderScreen();

    expect(await screen.findByTestId('payments-ledger-no-groups')).toBeTruthy();
    expect(paymentsApi.getGroupPayments).not.toHaveBeenCalled();
  });

  it('keeps the group selector inert with a single assigned group (UF §18: selector only if >1)', async () => {
    renderScreen();

    await screen.findByTestId('payments-ledger-content');
    expect(
      screen.getByTestId('payments-group-selector-name'),
    ).toHaveTextContent('حلقة الفجر');
    // Not a button: nothing to choose between (the chevron is decorative
    // and hidden from assistive tech, so the role is what carries this).
    expect(
      screen.getByTestId('payments-group-selector').props.accessibilityRole,
    ).toBeUndefined();
  });

  it('switches the ledger to another assigned group through the picker', async () => {
    (groupsApi.listGroups as jest.Mock).mockResolvedValue({
      data: [group('g-1', 'حلقة الفجر'), group('g-2', 'حلقة العصر')],
    });

    renderScreen();
    await screen.findByTestId('payments-ledger-content');
    expect(
      screen.getByTestId('payments-group-selector').props.accessibilityRole,
    ).toBe('button');

    fireEvent.press(screen.getByTestId('payments-group-selector'));
    fireEvent.press(
      await screen.findByTestId('payments-group-selector-option-g-2'),
    );

    await waitFor(() =>
      expect(paymentsApi.getGroupPayments).toHaveBeenCalledWith('g-2', {
        status: undefined,
      }),
    );
    expect(
      screen.getByTestId('payments-group-selector-name'),
    ).toHaveTextContent('حلقة العصر');
  });

  it('shows the generic Arabic retry copy on 5xx, never the server message (UF §24)', async () => {
    (paymentsApi.getGroupPayments as jest.Mock).mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'stack trace leak',
      }),
    );

    renderScreen();

    expect(
      await screen.findByTestId('payments-ledger-error-message'),
    ).toHaveTextContent(GENERIC_SERVER_MESSAGE);
    expect(screen.queryByText('stack trace leak')).toBeNull();
  });

  it('shows the generic network copy when the request never reaches the server (UF §24)', async () => {
    (paymentsApi.getGroupPayments as jest.Mock).mockRejectedValue(
      new NetworkError(),
    );

    renderScreen();

    expect(
      await screen.findByTestId('payments-ledger-error-message'),
    ).toHaveTextContent(NETWORK_MESSAGE);
  });

  it('shows the filter Arabic message on a 4xx and retries from the banner', async () => {
    (paymentsApi.getGroupPayments as jest.Mock).mockRejectedValueOnce(
      new ApiError({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      }),
    );

    renderScreen();

    const banner = await screen.findByTestId('payments-ledger-error-message');
    expect(banner).toHaveTextContent('ليس لديك صلاحية للوصول إلى هذا المورد');

    (paymentsApi.getGroupPayments as jest.Mock).mockResolvedValue([
      paidStudent,
    ]);
    fireEvent.press(screen.getByTestId('payments-ledger-error-retry-button'));

    expect(await screen.findByTestId('payments-ledger-list')).toBeTruthy();
  });

  it('offers no "Mark as Paid" action and no push into Payment Detail — both are F-PAY-03', async () => {
    renderScreen();

    await screen.findByTestId('payments-ledger-list');
    expect(
      screen.queryByTestId('payment-ledger-row-m-unpaid-mark-paid'),
    ).toBeNull();
    fireEvent.press(screen.getByTestId('payment-ledger-row-m-unpaid'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
