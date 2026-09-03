import {
  auditActionIcon,
  auditActionLabel,
  auditActorName,
  formatAuditTimestamp,
  UNKNOWN_ACTOR,
} from '../auditEntry';

describe('audit entry copy (F-ADM-03 / SCR-33)', () => {
  it('labels exactly the three audited actions (APIS §9.9)', () => {
    expect(auditActionLabel('LOGIN')).toBe('تسجيل الدخول');
    expect(auditActionLabel('GROUP_CREATED')).toBe('إنشاء مجموعة');
    expect(auditActionLabel('ENROLLMENT_TOGGLED')).toBe('تبديل التسجيل');
  });

  it('pairs each action with its Figma glyph', () => {
    expect(auditActionIcon('LOGIN')).toBe('log-out');
    expect(auditActionIcon('GROUP_CREATED')).toBe('layers');
    expect(auditActionIcon('ENROLLMENT_TOGGLED')).toBe('repeat');
  });

  it('shows the actor name, and the null marker when there is none (DEC-B04)', () => {
    expect(auditActorName('الشيخ عبد الرحمن')).toBe('الشيخ عبد الرحمن');
    expect(auditActorName(null)).toBe(UNKNOWN_ACTOR);
    expect(auditActorName('   ')).toBe(UNKNOWN_ACTOR);
  });
});

describe('formatAuditTimestamp (Figma 42:608)', () => {
  const now = new Date(2026, 8, 3, 12, 0, 0);

  function at(y: number, m: number, d: number, h: number, min: number): string {
    return new Date(y, m, d, h, min, 0).toISOString();
  }

  it('writes "اليوم HH:MM" for an entry from today', () => {
    expect(formatAuditTimestamp(at(2026, 8, 3, 8, 12), now)).toBe(
      'اليوم 08:12',
    );
  });

  it('writes "أمس HH:MM" for an entry from yesterday', () => {
    expect(formatAuditTimestamp(at(2026, 8, 2, 19, 30), now)).toBe('أمس 19:30');
  });

  it('writes the Tunisian day and month for an older entry this year', () => {
    expect(formatAuditTimestamp(at(2026, 8, 1, 21, 10), now)).toBe(
      '1 سبتمبر 21:10',
    );
  });

  it('adds the year once the entry falls outside the current one', () => {
    expect(formatAuditTimestamp(at(2025, 11, 31, 23, 5), now)).toBe(
      '31 ديسمبر 2025 23:05',
    );
  });

  it('falls back to the raw value when the instant is unparsable', () => {
    expect(formatAuditTimestamp('not-a-date', now)).toBe('not-a-date');
  });
});
