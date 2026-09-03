import { PaymentCycleDto } from '@/shared/api/payments.client';
import {
  CYCLE_AMOUNT_LABEL,
  CYCLE_AMOUNT_TND,
  CYCLE_STATUS_VARIANT,
  formatArabicInstantDate,
  formatArrearsBadgeLabel,
  formatArrearsMessage,
  formatCurrentCycleSubtitle,
  formatCycleSubtitle,
  formatCycleTitle,
  formatArabicMonthYear,
  formatArrearsCountLabel,
  formatArrearsTotal,
  formatGroupLedgerSummary,
  formatLedgerMeta,
  formatMarkPaidTitle,
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

  describe('formatCurrentCycleSubtitle (SCR-20 row, Figma 36:459)', () => {
    it('labels the current cycle with its end date', () => {
      expect(
        formatCurrentCycleSubtitle(
          cycle({ start_date: '2026-07-01', end_date: '2026-09-30' }),
        ),
      ).toBe('الدورة الحالية · 30 سبتمبر');
    });

    it('adds the year when the cycle crosses one, where day/month is ambiguous', () => {
      expect(
        formatCurrentCycleSubtitle(
          cycle({ start_date: '2026-11-15', end_date: '2027-02-14' }),
        ),
      ).toBe('الدورة الحالية · 14 فيفري 2027');
    });
  });

  describe('formatArrearsBadgeLabel (SCR-20 arrears badge, Figma 36:466)', () => {
    it('reads exactly as Figma writes it', () => {
      expect(formatArrearsBadgeLabel(3)).toBe('3 متأخرة');
      expect(formatArrearsBadgeLabel(1)).toBe('1 متأخرة');
    });
  });

  describe('formatGroupLedgerSummary (SCR-20 selector, Figma 36:435)', () => {
    it('matches the Figma line for a large group', () => {
      expect(formatGroupLedgerSummary(18, 4)).toBe('18 طالبًا · 4 متابعات');
    });

    it('agrees in Arabic number on both halves', () => {
      expect(formatGroupLedgerSummary(1, 1)).toBe('طالب واحد · متابعة واحدة');
      expect(formatGroupLedgerSummary(2, 2)).toBe('طالبان · متابعتان');
      expect(formatGroupLedgerSummary(5, 0)).toBe('5 طلاب · لا متابعات');
      expect(formatGroupLedgerSummary(0, 0)).toBe('لا طلاب · لا متابعات');
      expect(formatGroupLedgerSummary(11, 11)).toBe('11 طالبًا · 11 متابعة');
    });
  });

  describe('the SCR-21 summary (Figma 36:573)', () => {
    it('totals the arrears over the fixed public fee (BR-31, UF §18)', () => {
      expect(formatArrearsTotal(3)).toBe('90 دينارًا');
      expect(formatArrearsTotal(1)).toBe('30 دينارًا');
    });

    it('agrees in Arabic number on the arrears count, zero included', () => {
      expect(formatArrearsCountLabel(3)).toBe('3 دورات متأخرة');
      expect(formatArrearsCountLabel(0)).toBe('لا دورات متأخرة');
      expect(formatArrearsCountLabel(1)).toBe('دورة واحدة متأخرة');
      expect(formatArrearsCountLabel(2)).toBe('دورتان متأخرتان');
      expect(formatArrearsCountLabel(11)).toBe('11 دورة متأخرة');
    });

    it('reads "member since" off cycle 0, which BR-32 makes started_at itself', () => {
      expect(formatArabicMonthYear('2026-05-01')).toBe('ماي 2026');
      expect(formatLedgerMeta('حلقة الفجر', '2026-05-01')).toBe(
        'حلقة الفجر · عضو منذ ماي 2026',
      );
    });

    it('drops a half it does not have rather than inventing one', () => {
      expect(formatLedgerMeta(null, '2026-05-01')).toBe('عضو منذ ماي 2026');
      expect(formatLedgerMeta('حلقة الفجر', undefined)).toBe('حلقة الفجر');
      expect(formatLedgerMeta(null, null)).toBe('');
    });
  });

  describe('formatMarkPaidTitle (Figma 36:618)', () => {
    it('names the cycle the way the row above it does — 0-based index, 1-based label', () => {
      expect(formatMarkPaidTitle(cycle({ index: 4 }))).toBe(
        'تسجيل دفعة الدورة 5 كمستلَمة؟',
      );
      expect(formatMarkPaidTitle(cycle({ index: 0 }))).toBe(
        'تسجيل دفعة الدورة 1 كمستلَمة؟',
      );
    });
  });
});
