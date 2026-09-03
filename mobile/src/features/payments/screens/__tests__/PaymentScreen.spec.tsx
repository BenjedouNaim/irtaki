import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as paymentsApi from '@/shared/api/payments.client';
import { ApiError, NetworkError } from '@/shared/api/types';
import { PaymentScreen } from '../PaymentScreen';

jest.mock('@/shared/api/payments.client');

const NEVER = () => new Promise<never>(() => {});

const GENERIC_SERVER_MESSAGE = 'حدث خطأ أثناء تحميل سجلّ الدفع';
const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

const ledger: paymentsApi.PaymentLedgerDto = {
  cycles: [
    {
      index: 0,
      start_date: '2026-01-01',
      end_date: '2026-03-31',
      status: 'Paid',
      paid_at: '2026-01-12T09:00:00.000Z',
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
      status: 'Due Soon',
    },
  ],
  next_due_date: '2026-06-30',
  arrears_count: 1,
};

let queryClient: QueryClient;

function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentScreen />
    </QueryClientProvider>,
  );
}

describe('PaymentScreen (SCR-16, F-PAY-01, Figma 30:701)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders a layout-matched skeleton on first load (UF §22)', () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockImplementation(NEVER);

    renderScreen();

    expect(screen.getByTestId('payment-skeleton')).toBeTruthy();
    expect(screen.getByTestId('payment-skeleton-badge')).toBeTruthy();
    expect(screen.getByTestId('payment-skeleton-rows')).toBeTruthy();
    expect(screen.getByTestId('skeleton-report-row-3')).toBeTruthy();
    expect(screen.queryByTestId('payment-content')).toBeNull();
  });

  it('renders the tab-root TopBar without a back control (UF §31)', async () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockResolvedValue(ledger);

    renderScreen();

    expect(screen.getByTestId('payment-top-bar-title').props.children).toBe(
      'الدفع',
    );
    expect(screen.queryByTestId('payment-top-bar-back')).toBeNull();
    await screen.findByTestId('payment-content');
  });

  it('shows the current cycle badge, the next due date and the fixed fee', async () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockResolvedValue(ledger);

    renderScreen();

    await screen.findByTestId('payment-content');
    // The badge is the most recent cycle's status — cycle 2 here.
    expect(
      screen.getByTestId('current-cycle-card-badge').props.accessibilityLabel,
    ).toBe('الحالة: يستحق قريبًا');
    expect(screen.getByTestId('current-cycle-card-label').props.children).toBe(
      'الدورة الحالية',
    );
    expect(
      screen.getByTestId('current-cycle-card-due-date').props.children,
    ).toBe('30 جوان 2026');
    expect(
      screen.getByTestId('current-cycle-card-caption').props.children,
    ).toBe('موعد الاستحقاق القادم · 30 دينار');
  });

  it('renders a null next_due_date as a null, never as a guessed date', async () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockResolvedValue({
      cycles: [
        {
          index: 0,
          start_date: '2026-01-01',
          end_date: '2026-03-31',
          status: 'Paid',
          paid_at: '2026-01-12T09:00:00.000Z',
        },
      ],
      next_due_date: null,
      arrears_count: 0,
    });

    renderScreen();

    await screen.findByTestId('payment-content');
    expect(
      screen.getByTestId('current-cycle-card-due-date').props.children,
    ).toBe('—');
    expect(
      screen.getByTestId('current-cycle-card-caption').props.children,
    ).toBe('لا توجد دورة مستحقة حاليًا');
  });

  it('lists every cycle newest-first with its status, range and subtitle (UXQ-10)', async () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockResolvedValue(ledger);

    renderScreen();

    await screen.findByTestId('payment-content');
    expect(screen.getByTestId('payment-cycle-list-label').props.children).toBe(
      'سجلّ الدورات',
    );

    const rows = screen.getAllByTestId(/^payment-cycle-row-\d+$/);
    expect(rows).toHaveLength(3);

    expect(screen.getByTestId('payment-cycle-row-2-title').props.children).toBe(
      'الدورة 3 · 1 جويلية — 30 سبتمبر',
    );
    expect(
      screen.getByTestId('payment-cycle-row-2-subtitle').props.children,
    ).toBe('30 دينار');
    expect(
      screen.getByTestId('payment-cycle-row-2-badge').props.accessibilityLabel,
    ).toBe('الحالة: يستحق قريبًا');

    expect(
      screen.getByTestId('payment-cycle-row-0-subtitle').props.children,
    ).toMatch(/^دُفعت في 12 جانفي 2026$/);
    expect(
      screen.getByTestId('payment-cycle-row-0-badge').props.accessibilityLabel,
    ).toBe('الحالة: مدفوع');
  });

  it('shows the arrears banner with the client-side total when arrears exist (UF §18)', async () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockResolvedValue(ledger);

    renderScreen();

    const banner = await screen.findByTestId('payment-arrears-banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(
      screen.getByTestId('payment-arrears-banner-message').props.children,
    ).toBe('دورة واحدة غير مدفوعة — الإجمالي 30 دينارًا');
    // UF §32: the notice is an icon paired with text, never colour alone.
    expect(screen.getByTestId('payment-arrears-banner-icon')).toBeTruthy();
  });

  it('hides the arrears banner when nothing is in arrears', async () => {
    jest
      .spyOn(paymentsApi, 'getMyPayments')
      .mockResolvedValue({ ...ledger, arrears_count: 0 });

    renderScreen();

    await screen.findByTestId('payment-content');
    expect(screen.queryByTestId('payment-arrears-banner')).toBeNull();
  });

  it('offers no action of any kind — recording is the Assistant’s (ISS-02)', async () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockResolvedValue(ledger);

    renderScreen();

    await screen.findByTestId('payment-content');
    expect(screen.queryByTestId('payment-cycle-row-1-mark-paid')).toBeNull();
    expect(screen.queryByText('تسجيل الدفع')).toBeNull();
  });

  it('shows the generic Arabic retry copy on a 5xx, never the server message (UF §24)', async () => {
    const spy = jest
      .spyOn(paymentsApi, 'getMyPayments')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'Postgres exploded',
        }),
      )
      .mockResolvedValueOnce(ledger);

    renderScreen();

    const error = await screen.findByTestId('payment-error');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(screen.getByTestId('payment-error-message').props.children).toBe(
      GENERIC_SERVER_MESSAGE,
    );
    expect(screen.queryByText('Postgres exploded')).toBeNull();

    fireEvent.press(screen.getByTestId('payment-error-retry-button'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('payment-content')).toBeTruthy();
  });

  it('shows the generic connectivity copy when the network is unavailable (UF §24)', async () => {
    jest
      .spyOn(paymentsApi, 'getMyPayments')
      .mockRejectedValue(new NetworkError());

    renderScreen();

    await screen.findByTestId('payment-error');
    expect(screen.getByTestId('payment-error-message').props.children).toBe(
      NETWORK_MESSAGE,
    );
  });

  it('shows the filter Arabic message on a 4xx (a Student with no membership)', async () => {
    jest.spyOn(paymentsApi, 'getMyPayments').mockRejectedValue(
      new ApiError({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      }),
    );

    renderScreen();

    await screen.findByTestId('payment-error');
    expect(screen.getByTestId('payment-error-message').props.children).toBe(
      'المورد المطلوب غير موجود',
    );
  });
});
