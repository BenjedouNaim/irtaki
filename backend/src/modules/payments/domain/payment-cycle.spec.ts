import {
  DUE_SOON_WINDOW_DAYS,
  PAYMENT_CYCLE_AMOUNT,
  PAYMENT_CYCLE_MONTHS,
  addMonthsClamped,
  cycleEndDate,
  cycleStartDate,
  daysInMonth,
  paymentCycle,
} from './payment-cycle';

describe('PaymentCycle (VO-05)', () => {
  it('carries the specified business constants (BR-31, BR-33)', () => {
    expect(PAYMENT_CYCLE_MONTHS).toBe(3);
    expect(PAYMENT_CYCLE_AMOUNT).toBe(30);
    expect(DUE_SOON_WINDOW_DAYS).toBe(10);
  });

  describe('daysInMonth', () => {
    it('knows the short months and both Februaries', () => {
      expect(daysInMonth(2026, 1)).toBe(31);
      expect(daysInMonth(2026, 2)).toBe(28);
      expect(daysInMonth(2028, 2)).toBe(29);
      expect(daysInMonth(2026, 4)).toBe(30);
      expect(daysInMonth(2026, 12)).toBe(31);
    });

    it('applies the centennial leap rule', () => {
      expect(daysInMonth(1900, 2)).toBe(28);
      expect(daysInMonth(2000, 2)).toBe(29);
    });
  });

  describe('addMonthsClamped (ISS-14 — clamp, never roll forward)', () => {
    it('keeps the day of month when the target month is long enough', () => {
      expect(addMonthsClamped('2026-01-15', 3)).toBe('2026-04-15');
      expect(addMonthsClamped('2026-08-01', 3)).toBe('2026-11-01');
    });

    it('clamps 30 November + 3 months to 28 February in a common year', () => {
      expect(addMonthsClamped('2025-11-30', 3)).toBe('2026-02-28');
    });

    it('clamps 30 November + 3 months to 29 February in a leap year', () => {
      expect(addMonthsClamped('2027-11-30', 3)).toBe('2028-02-29');
    });

    it('clamps a 31st into every shorter target month', () => {
      expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
      expect(addMonthsClamped('2026-03-31', 3)).toBe('2026-06-30');
      expect(addMonthsClamped('2026-08-31', 3)).toBe('2026-11-30');
    });

    it('never accumulates a clamp — every shift is measured from the origin', () => {
      expect(addMonthsClamped('2025-11-30', 3)).toBe('2026-02-28');
      expect(addMonthsClamped('2025-11-30', 6)).toBe('2026-05-30');
      expect(addMonthsClamped('2025-11-30', 9)).toBe('2026-08-30');
      expect(addMonthsClamped('2025-11-30', 12)).toBe('2026-11-30');
    });

    it('crosses year boundaries in both directions', () => {
      expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
      expect(addMonthsClamped('2026-01-15', -3)).toBe('2025-10-15');
    });

    it('rejects anything that is not YYYY-MM-DD', () => {
      expect(() => addMonthsClamped('2026-1-5', 3)).toThrow(RangeError);
    });
  });

  describe('cycle bounds (SAS §18.5)', () => {
    it('starts cycle 0 on the membership start date', () => {
      expect(cycleStartDate('2026-01-15', 0)).toBe('2026-01-15');
    });

    it('advances the start by three whole months per index', () => {
      expect(cycleStartDate('2026-01-15', 1)).toBe('2026-04-15');
      expect(cycleStartDate('2026-01-15', 4)).toBe('2027-01-15');
    });

    it('ends a cycle the day before the next one starts', () => {
      expect(cycleEndDate('2026-01-15', 0)).toBe('2026-04-14');
      expect(cycleEndDate('2026-01-15', 1)).toBe('2026-07-14');
    });

    it('keeps cycles contiguous across a clamped boundary', () => {
      // 30 Nov 2025 → the clamped 28 Feb start makes cycle 0 end 27 Feb.
      expect(paymentCycle('2025-11-30', 0)).toEqual({
        index: 0,
        startDate: '2025-11-30',
        endDate: '2026-02-27',
      });
      expect(paymentCycle('2025-11-30', 1)).toEqual({
        index: 1,
        startDate: '2026-02-28',
        endDate: '2026-05-29',
      });
    });

    it('rejects a negative or fractional index (DB-CHK-18)', () => {
      expect(() => paymentCycle('2026-01-15', -1)).toThrow(RangeError);
      expect(() => paymentCycle('2026-01-15', 1.5)).toThrow(RangeError);
    });
  });
});
