import { PaymentCycleDto } from '@/shared/api/payments.client';
import {
  CYCLE_AMOUNT_LABEL,
  CYCLE_AMOUNT_TND,
  CYCLE_STATUS_VARIANT,
  formatArabicInstantDate,
  formatArrearsMessage,
  formatCycleSubtitle,
  formatCycleTitle,
} from '../paymentCopy';

function cycle(overrides: Partial<PaymentCycleDto> = {}): PaymentCycleDto {
  return {
    index: 2,
    start_date: '2026-06-01',
    end_date: '2026-08-30',
    status: 'Unpaid',
    ...overrides,
  };
}

describe('paymentCopy (SCR-16, UF §18)', () => {
  it('keeps the fee the specified fixed 30 TND (BR-31)', () => {
    expect(CYCLE_AMOUNT_TND).toBe(30);
    expect(CYCLE_AMOUNT_LABEL).toBe('30 دينار');
  });

  it('maps every API status onto a CycleRow variant', () => {
    expect(CYCLE_STATUS_VARIANT).toEqual({
      Paid: 'paid',
      'Due Soon': 'dueSoon',
      Unpaid: 'unpaid',
    });
  });

  describe('formatCycleTitle', () => {
    it('numbers the cycle from 1 and renders the day/month range (Figma)', () => {
      expect(formatCycleTitle(cycle())).toBe('الدورة 3 · 1 جوان — 30 أوت');
    });

    it('numbers cycle 0 as the first cycle, never as zero', () => {
      expect(formatCycleTitle(cycle({ index: 0 }))).toMatch(/^الدورة 1 · /);
    });

    it('adds the year on both ends when the cycle crosses one', () => {
      expect(
        formatCycleTitle(
          cycle({
            index: 0,
            start_date: '2025-11-30',
            end_date: '2026-02-27',
          }),
        ),
      ).toBe('الدورة 1 · 30 نوفمبر 2025 — 27 فيفري 2026');
    });
  });

  describe('formatCycleSubtitle', () => {
    it('shows the fixed fee on a cycle that is not paid', () => {
      expect(formatCycleSubtitle(cycle())).toBe('30 دينار');
      expect(formatCycleSubtitle(cycle({ status: 'Due Soon' }))).toBe(
        '30 دينار',
      );
    });

    it('shows the payment date on a Paid cycle', () => {
      expect(
        formatCycleSubtitle(
          cycle({ status: 'Paid', paid_at: '2026-06-12T10:00:00.000Z' }),
        ),
      ).toBe(`دُفعت في ${formatArabicInstantDate('2026-06-12T10:00:00.000Z')}`);
    });

    it('falls back to the fee when a Paid cycle somehow carries no instant', () => {
      expect(formatCycleSubtitle(cycle({ status: 'Paid' }))).toBe('30 دينار');
    });
  });

  describe('formatArrearsMessage', () => {
    it('renders the Figma copy for three unpaid cycles', () => {
      expect(formatArrearsMessage(3)).toBe(
        '3 دورات غير مدفوعة — الإجمالي 90 دينارًا',
      );
    });

    it('agrees in number for one and two cycles', () => {
      expect(formatArrearsMessage(1)).toBe(
        'دورة واحدة غير مدفوعة — الإجمالي 30 دينارًا',
      );
      expect(formatArrearsMessage(2)).toBe(
        'دورتان غير مدفوعتان — الإجمالي 60 دينارًا',
      );
    });

    it('uses the singular noun past ten', () => {
      expect(formatArrearsMessage(11)).toBe(
        '11 دورة غير مدفوعة — الإجمالي 330 دينارًا',
      );
    });
  });
});
