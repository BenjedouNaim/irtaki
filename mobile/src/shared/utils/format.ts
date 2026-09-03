/**
 * Copy helpers shared by the Teacher/Admin screens: Tunisian month names and
 * Arabic count agreement, so "18 طالبًا" / "مجموعتان" / "5 مجموعات" read the
 * way the Figma frames write them. Numerals stay Western (UF §31).
 */

/** Months as the centre writes them (Tunisian usage). */
export const TUNISIAN_MONTHS = [
  'جانفي',
  'فيفري',
  'مارس',
  'أفريل',
  'ماي',
  'جوان',
  'جويلية',
  'أوت',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function parseDateParts(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(value);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export interface FormatArabicDateOptions {
  /** Append the year ("12 جوان 2026"); default true. */
  year?: boolean;
}

/**
 * "2026-06-12" → "12 جوان 2026". Falls back to the raw string when the
 * value is not a date. Date-only strings are read as-is (no timezone shift).
 */
export function formatArabicDate(
  value: string,
  { year = true }: FormatArabicDateOptions = {},
): string {
  const parts = parseDateParts(value);
  if (!parts || parts.month < 1 || parts.month > 12) return value;
  const month = TUNISIAN_MONTHS[parts.month - 1];
  return year ? `${parts.day} ${month} ${parts.year}` : `${parts.day} ${month}`;
}

/** "2026-05-03" → "ماي 2026". */
export function formatArabicMonthYear(value: string): string {
  const parts = parseDateParts(value);
  if (!parts || parts.month < 1 || parts.month > 12) return value;
  return `${TUNISIAN_MONTHS[parts.month - 1]} ${parts.year}`;
}

export interface ArabicCountForms {
  /** n = 0, e.g. "لا مجموعات". */
  zero: string;
  /** n = 1, e.g. "مجموعة واحدة". */
  one: string;
  /** n = 2, e.g. "مجموعتان". */
  two: string;
  /** 3 ≤ n ≤ 10 — the plural after the numeral, e.g. "مجموعات". */
  few: string;
  /** n ≥ 11 — the accusative singular after the numeral, e.g. "مجموعة". */
  many: string;
}

/** Arabic number agreement for a counted noun. */
export function formatArabicCount(n: number, forms: ArabicCountForms): string {
  if (n <= 0) return forms.zero;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

export const GROUP_COUNT_FORMS: ArabicCountForms = {
  zero: 'لا مجموعات',
  one: 'مجموعة واحدة',
  two: 'مجموعتان',
  few: 'مجموعات',
  many: 'مجموعة',
};

export const STUDENT_COUNT_FORMS: ArabicCountForms = {
  zero: 'لا طلاب',
  one: 'طالب واحد',
  two: 'طالبان',
  few: 'طلاب',
  many: 'طالبًا',
};

export const REPORT_COUNT_FORMS: ArabicCountForms = {
  zero: 'لا تقارير',
  one: 'تقرير واحد',
  two: 'تقريران',
  few: 'تقارير',
  many: 'تقريرًا',
};

export const CYCLE_COUNT_FORMS: ArabicCountForms = {
  zero: 'لا دورات',
  one: 'دورة واحدة',
  two: 'دورتان',
  few: 'دورات',
  many: 'دورة',
};

/** Roster gender as the Admin roster shows it ("الاسم والجنس فقط"). */
export function formatGender(gender: string | null | undefined): string | null {
  if (gender === 'Male') return 'ذكر';
  if (gender === 'Female') return 'أنثى';
  return null;
}
