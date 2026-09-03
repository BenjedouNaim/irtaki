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
  PaymentDetailScreen,
  ALREADY_PAID_TOAST,
  CYCLE_LIST_LABEL,
  MARK_PAID_CONFIRM_LABEL,
  MARK_PAID_WARNING,
  RECORDED_TOAST,
  STUDENT_NOT_FOUND_MESSAGE,
} from '../PaymentDetailScreen';

jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/payments.client');

const mockRouteParams: { current: Record<string, string> } = {
  current: { id: 'm-1', groupId: 'g-1' },
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams.current,
  router: { back: jest.fn() },
}));

const NEVER = () => new Promise<never>(() => {});

const GENERIC_SERVER_MESSAGE = 'حدث خطأ أثناء تحميل سجلّ المدفوعات';
const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
const GENERIC_RECORD_MESSAGE = 'تعذر تسجيل الدفع. يرجى المحاولة مرة أخرى.';

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

/** Cycle 0 paid, cycles 1 and 2 unpaid — 2 in arrears, exactly Figma 36:543. */
function ledger(
  overrides: Partial<paymentsApi.GroupStudentLedgerDto> = {},
): paymentsApi.GroupStudentLedgerDto {
  return {
    membership_id: 'm-1',
    full_name: 'يوسف بن سالم',
    cycles: [
      {
        index: 0,
        start_date: '2026-05-01',
        end_date: '2026-07-31',
        status: 'Paid',
        paid_at: '2026-05-03T09:00:00.000Z',
      },
      {
        index: 1,
        start_date: '2026-08-01',
        end_date: '2026-10-31',
        status: 'Unpaid',
      },
      {
        index: 2,
        start_date: '2026-11-01',
        end_date: '2027-01-31',
        status: 'Unpaid',
      },
    ],
    next_due_date: '2026-10-31',
    arrears_count: 2,
    ...overrides,
  };
}

const record: paymentsApi.PaymentRecordDto = {
  id: 'p-1',
  cycle_index: 2,
  amount: 30,
  paid_at: '2026-09-03T09:00:00.000Z',
  recorded_by: 'a-1',
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
      <PaymentDetailScreen />
    </QueryClientProvider>,
  );
}

async function openConfirmForNewestCycle() {
  renderScreen();
  await screen.findByTestId('payment-detail-content');
  fireEvent.press(screen.getByTestId('payment-detail-cycle-row-2-mark-paid'));
  await screen.findByTestId('payment-detail-confirm-container');
}

describe('PaymentDetailScreen (SCR-21, F-PAY-03, Figma 36:543 / 36:618)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams.current = { id: 'm-1', groupId: 'g-1' };
    (groupsApi.listGroups as jest.Mock).mockResolvedValue({
      data: [group('g-1', 'حلقة الفجر')],
    });
    (paymentsApi.getGroupPayments as jest.Mock).mockResolvedValue([ledger()]);
    (paymentsApi.recordPayment as jest.Mock).mockResolvedValue(record);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  describe('the screen itself (Figma 36:543)', () => {
    it('renders a layout-matched skeleton on first load (UF §22)', () => {
      (paymentsApi.getGroupPayments as jest.Mock).mockImplementation(NEVER);

      renderScreen();

      expect(screen.getByTestId('payment-detail-skeleton')).toBeTruthy();
      expect(screen.getByTestId('payment-detail-skeleton-rows')).toBeTruthy();
      expect(screen.queryByTestId('payment-detail-content')).toBeNull();
    });

    it('titles the TopBar with the student and offers the back control (UF §31)', async () => {
      renderScreen();

      await screen.findByTestId('payment-detail-content');
      expect(screen.getByTestId('payment-detail-top-bar')).toHaveTextContent(
        'يوسف بن سالم',
      );
      expect(screen.getByTestId('payment-detail-top-bar-back')).toBeTruthy();
    });

    it('reads the group ledger it was opened from — no per-student endpoint exists', async () => {
      renderScreen();

      await screen.findByTestId('payment-detail-content');
      expect(paymentsApi.getGroupPayments).toHaveBeenCalledWith('g-1', {
        status: undefined,
      });
    });

    it('renders the arrears summary: count, the BR-31 total and the group / member-since line', async () => {
      renderScreen();

      await screen.findByTestId('payment-detail-content');
      expect(
        screen.getByTestId('payment-detail-arrears-count'),
      ).toHaveTextContent('دورتان متأخرتان');
      // 2 × 30, client-side arithmetic on the fixed public fee (UF §18).
      expect(
        screen.getByTestId('payment-detail-arrears-total'),
      ).toHaveTextContent('60 دينارًا');
      expect(screen.getByTestId('payment-detail-meta')).toHaveTextContent(
        'حلقة الفجر · عضو منذ ماي 2026',
      );
    });

    it('drops the error-red total once nothing is overdue', async () => {
      (paymentsApi.getGroupPayments as jest.Mock).mockResolvedValue([
        ledger({ arrears_count: 0 }),
      ]);

      renderScreen();

      await screen.findByTestId('payment-detail-content');
      expect(
        screen.getByTestId('payment-detail-arrears-count'),
      ).toHaveTextContent('لا دورات متأخرة');
      expect(screen.queryByTestId('payment-detail-arrears-total')).toBeNull();
    });

    it('lists every cycle newest-first under the "any order" label, with the paid date on a Paid one', async () => {
      renderScreen();

      await screen.findByTestId('payment-detail-cycle-list');
      expect(
        screen.getByTestId('payment-detail-cycle-list-label'),
      ).toHaveTextContent(CYCLE_LIST_LABEL);
      const list = screen.getByTestId('payment-detail-cycle-list');
      expect(
        list.props.children.map(
          (row: { props: { status: string } }) => row.props.status,
        ),
      ).toEqual(['unpaid', 'unpaid', 'paid']);
      expect(
        screen.getByTestId('payment-detail-cycle-row-0-title'),
      ).toHaveTextContent('الدورة 1 · 1 ماي — 31 جويلية');
      expect(
        screen.getByTestId('payment-detail-cycle-row-0-subtitle'),
      ).toHaveTextContent('دُفعت في 3 ماي 2026');
      expect(
        screen.getByTestId('payment-detail-cycle-row-2-subtitle'),
      ).toHaveTextContent('30 دينار');
    });

    it('offers "Mark as Paid" on every unpaid cycle and none on a Paid one (BR-56, no correction path)', async () => {
      renderScreen();

      await screen.findByTestId('payment-detail-cycle-list');
      expect(
        screen.getByTestId('payment-detail-cycle-row-1-mark-paid'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('payment-detail-cycle-row-2-mark-paid'),
      ).toBeTruthy();
      expect(
        screen.queryByTestId('payment-detail-cycle-row-0-mark-paid'),
      ).toBeNull();
      expect(
        screen.getByTestId('payment-detail-cycle-row-0-badge'),
      ).toHaveTextContent('مدفوع');
    });

    it('shows the empty state when the student is no longer in this group’s ledger', async () => {
      (paymentsApi.getGroupPayments as jest.Mock).mockResolvedValue([]);

      renderScreen();

      expect(
        await screen.findByTestId('payment-detail-missing'),
      ).toHaveTextContent(STUDENT_NOT_FOUND_MESSAGE);
    });
  });

  describe('the mark-paid confirmation (Figma 36:618, UF §25 strongest copy)', () => {
    it('opens a strong dialog naming the cycle, warning that nothing can be undone', async () => {
      await openConfirmForNewestCycle();

      expect(
        screen.getByTestId('payment-detail-confirm-title'),
      ).toHaveTextContent('تسجيل دفعة الدورة 3 كمستلَمة؟');
      expect(
        screen.getByTestId('payment-detail-confirm-message'),
      ).toHaveTextContent(MARK_PAID_WARNING);
      expect(paymentsApi.recordPayment).not.toHaveBeenCalled();
    });

    it('records nothing when the dialog is cancelled', async () => {
      await openConfirmForNewestCycle();

      fireEvent.press(
        screen.getByTestId('payment-detail-confirm-cancel-button'),
      );

      expect(paymentsApi.recordPayment).not.toHaveBeenCalled();
    });

    it('posts only the cycle index on confirm — the 30 TND fee is never client-supplied (BR-31)', async () => {
      await openConfirmForNewestCycle();

      fireEvent.press(
        screen.getByTestId('payment-detail-confirm-confirm-button'),
      );

      await waitFor(() =>
        expect(paymentsApi.recordPayment).toHaveBeenCalledWith('m-1', {
          cycle_index: 2,
        }),
      );
    });

    it('closes the dialog and shows the success toast on 201 (UF §18)', async () => {
      await openConfirmForNewestCycle();

      fireEvent.press(
        screen.getByTestId('payment-detail-confirm-confirm-button'),
      );

      expect(
        await screen.findByTestId('payment-detail-toast'),
      ).toHaveTextContent(RECORDED_TOAST);
      await waitFor(() =>
        expect(
          screen.queryByTestId('payment-detail-confirm-container'),
        ).toBeNull(),
      );
    });

    it('treats 409 CYCLE_ALREADY_PAID as a quiet toast, never an error banner (UF §18)', async () => {
      (paymentsApi.recordPayment as jest.Mock).mockRejectedValue(
        new ApiError({
          statusCode: 409,
          error: 'CYCLE_ALREADY_PAID',
          message: 'تم تسجيل دفع هذه الدورة مسبقاً',
        }),
      );
      await openConfirmForNewestCycle();

      fireEvent.press(
        screen.getByTestId('payment-detail-confirm-confirm-button'),
      );

      expect(
        await screen.findByTestId('payment-detail-toast'),
      ).toHaveTextContent(ALREADY_PAID_TOAST);
      expect(screen.queryByTestId('payment-detail-confirm-error')).toBeNull();
    });

    it('keeps the dialog open with an icon + text error on a network failure, so it can be retried (UF §18/§32)', async () => {
      (paymentsApi.recordPayment as jest.Mock).mockRejectedValue(
        new NetworkError('offline'),
      );
      await openConfirmForNewestCycle();

      fireEvent.press(
        screen.getByTestId('payment-detail-confirm-confirm-button'),
      );

      const banner = await screen.findByTestId('payment-detail-confirm-error');
      expect(banner).toHaveTextContent(NETWORK_MESSAGE);
      expect(
        screen.getByTestId('payment-detail-confirm-error-icon'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('payment-detail-confirm-container'),
      ).toBeTruthy();

      (paymentsApi.recordPayment as jest.Mock).mockResolvedValue(record);
      fireEvent.press(
        screen.getByTestId('payment-detail-confirm-confirm-button'),
      );
      expect(
        await screen.findByTestId('payment-detail-toast'),
      ).toHaveTextContent(RECORDED_TOAST);
    });

    it('never shows the server’s own message on a 5xx (UF §24)', async () => {
      (paymentsApi.recordPayment as jest.Mock).mockRejectedValue(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'stack trace leak',
        }),
      );
      await openConfirmForNewestCycle();

      fireEvent.press(
        screen.getByTestId('payment-detail-confirm-confirm-button'),
      );

      const banner = await screen.findByTestId('payment-detail-confirm-error');
      expect(banner).toHaveTextContent(GENERIC_RECORD_MESSAGE);
      expect(banner).not.toHaveTextContent('stack trace leak');
    });

    it('shows the filter’s Arabic message on a 422 FUTURE_CYCLE (UF §24 — defensive only)', async () => {
      (paymentsApi.recordPayment as jest.Mock).mockRejectedValue(
        new ApiError({
          statusCode: 422,
          error: 'FUTURE_CYCLE',
          message: 'لم تبدأ هذه الدورة بعد؛ لا يمكن تسجيل دفعها',
        }),
      );
      await openConfirmForNewestCycle();

      fireEvent.press(
        screen.getByTestId('payment-detail-confirm-confirm-button'),
      );

      expect(
        await screen.findByTestId('payment-detail-confirm-error'),
      ).toHaveTextContent('لم تبدأ هذه الدورة بعد؛ لا يمكن تسجيل دفعها');
    });

    it('refreshes the ledger after a recording so the badge flips in place', async () => {
      (paymentsApi.getGroupPayments as jest.Mock)
        .mockResolvedValueOnce([ledger()])
        .mockResolvedValue([
          ledger({
            cycles: [
              ...ledger().cycles.slice(0, 2),
              {
                index: 2,
                start_date: '2026-11-01',
                end_date: '2027-01-31',
                status: 'Paid',
                paid_at: record.paid_at,
              },
            ],
            arrears_count: 1,
          }),
        ]);
      await openConfirmForNewestCycle();

      fireEvent.press(
        screen.getByTestId('payment-detail-confirm-confirm-button'),
      );

      await waitFor(() =>
        expect(
          screen.getByTestId('payment-detail-cycle-row-2-badge'),
        ).toHaveTextContent('مدفوع'),
      );
      expect(
        screen.queryByTestId('payment-detail-cycle-row-2-mark-paid'),
      ).toBeNull();
    });
  });

  describe('errors on the read path (UF §24)', () => {
    it('shows the generic retry copy on a network failure, never the raw error', async () => {
      (paymentsApi.getGroupPayments as jest.Mock).mockRejectedValue(
        new NetworkError('offline'),
      );

      renderScreen();

      expect(
        await screen.findByTestId('payment-detail-error-message'),
      ).toHaveTextContent(NETWORK_MESSAGE);
    });

    it('shows the generic retry copy on a 5xx, never the server message', async () => {
      (paymentsApi.getGroupPayments as jest.Mock).mockRejectedValue(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'stack trace leak',
        }),
      );

      renderScreen();

      const banner = await screen.findByTestId('payment-detail-error-message');
      expect(banner).toHaveTextContent(GENERIC_SERVER_MESSAGE);
      expect(banner).not.toHaveTextContent('stack trace leak');
    });

    it('shows the filter’s Arabic message on a 403 (UF §24)', async () => {
      (paymentsApi.getGroupPayments as jest.Mock).mockRejectedValue(
        new ApiError({
          statusCode: 403,
          error: 'SCOPE_DENIED',
          message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
        }),
      );

      renderScreen();

      expect(
        await screen.findByTestId('payment-detail-error-message'),
      ).toHaveTextContent('ليس لديك صلاحية للوصول إلى هذا المورد');
    });

    it('reports a link opened without a group rather than guessing one', async () => {
      mockRouteParams.current = { id: 'm-1' };

      renderScreen();

      expect(
        await screen.findByTestId('payment-detail-invalid-params'),
      ).toHaveTextContent(STUDENT_NOT_FOUND_MESSAGE);
      expect(paymentsApi.getGroupPayments).not.toHaveBeenCalled();
    });
  });

  it('offers no way to undo a recorded payment (ISS-02 / APIQ-02)', async () => {
    renderScreen();

    await screen.findByTestId('payment-detail-content');
    expect(screen.queryByText('إلغاء الدفع')).toBeNull();
    expect(screen.queryByText('تصحيح')).toBeNull();
    expect(screen.queryByText('حذف')).toBeNull();
    expect(MARK_PAID_CONFIRM_LABEL).toBe('تأكيد التسجيل');
  });
});
