import {
  addDays,
  formatArabicDate,
  formatArabicDayMonth,
  formatArabicWeekRange,
  formatTimeWindow,
  greetingForHour,
  isoWeekday,
  parseIsoDate,
  toIsoDate,
} from '../arabicDate';

describe('arabicDate (Figma copy: Western numerals, Tunisian month names)', () => {
  it('parses and re-serialises YYYY-MM-DD, rejecting anything else', () => {
    expect(parseIsoDate('2026-09-03')).toEqual({
      year: 2026,
      month: 9,
      day: 3,
    });
    expect(parseIsoDate('03/09/2026')).toBeNull();
    expect(toIsoDate({ year: 2026, month: 1, day: 7 })).toBe('2026-01-07');
  });

  it('maps calendar dates to ISO weekdays (1 = Monday … 7 = Sunday)', () => {
    expect(isoWeekday({ year: 2026, month: 9, day: 3 })).toBe(4); // Thursday
    expect(isoWeekday({ year: 2026, month: 9, day: 6 })).toBe(7); // Sunday
    expect(isoWeekday({ year: 2026, month: 9, day: 7 })).toBe(1); // Monday
  });

  it('adds days across month boundaries', () => {
    expect(addDays({ year: 2026, month: 8, day: 30 }, 4)).toEqual({
      year: 2026,
      month: 9,
      day: 3,
    });
    expect(toIsoDate(addDays({ year: 2026, month: 9, day: 3 }, -6))).toBe(
      '2026-08-28',
    );
  });

  it('formats "الأربعاء 3 سبتمبر" and "3 سبتمبر", passing unknown strings through', () => {
    expect(formatArabicDate('2026-09-02')).toBe('الأربعاء 2 سبتمبر');
    expect(formatArabicDate('2026-08-31')).toBe('الاثنين 31 أوت');
    expect(formatArabicDayMonth('2026-08-28')).toBe('28 أوت');
    expect(formatArabicDate('not-a-date')).toBe('not-a-date');
  });

  it('formats a week range, collapsing the month when shared', () => {
    expect(formatArabicWeekRange('2026-08-28', '2026-09-03')).toBe(
      'أسبوع 28 أوت — 3 سبتمبر',
    );
    expect(formatArabicWeekRange('2026-08-21', '2026-08-27')).toBe(
      'أسبوع 21 — 27 أوت',
    );
  });

  it('formats a time window and the greeting by hour', () => {
    expect(formatTimeWindow('05:50', '06:40')).toBe('05:50 — 06:40');
    expect(greetingForHour(9)).toBe('صباح الخير');
    expect(greetingForHour(15)).toBe('مساء الخير');
  });
});
