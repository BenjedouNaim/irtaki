import { AuditActionName } from '@/shared/api/audit.client';
import { IconName } from '@/shared/components';
import { TUNISIAN_MONTHS } from '@/shared/utils/format';

/**
 * The three audited actions as SCR-33 writes them (Figma 42:597 / 42:610).
 * There is no fourth entry and no fallback label to write — APIS §9.9 lets
 * exactly these three reach the client.
 */
export const AUDIT_ACTION_LABELS: Record<AuditActionName, string> = {
  LOGIN: 'تسجيل الدخول',
  GROUP_CREATED: 'إنشاء مجموعة',
  ENROLLMENT_TOGGLED: 'تبديل التسجيل',
};

/** Figma 42:613 / 42:624 / 42:634 — one glyph per action. */
export const AUDIT_ACTION_ICONS: Record<AuditActionName, IconName> = {
  LOGIN: 'log-out',
  GROUP_CREATED: 'layers',
  ENROLLMENT_TOGGLED: 'repeat',
};

export function auditActionLabel(action: AuditActionName): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditActionIcon(action: AuditActionName): IconName {
  return AUDIT_ACTION_ICONS[action] ?? 'history';
}

/** UF §30's null marker — an absent value is shown, never fabricated. */
export const UNKNOWN_ACTOR = '—';

/**
 * The entry's second line: who acted. API-054 embeds only
 * `actor: { id, full_name }`, so that name is the whole line; `full_name`
 * is null for an account that never carried one (a `LOGIN` written at
 * registration, APIS §9.9), and a null stays visible as a null.
 */
export function auditActorName(fullName: string | null): string {
  const trimmed = fullName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : UNKNOWN_ACTOR;
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Figma 42:608 — "اليوم 08:12", "أمس 19:30", "1 سبتمبر 21:10". An audit
 * entry is an instant, not a calendar date, so it is read in the device's
 * own timezone (the `formatLocalTime` precedent); Western numerals
 * throughout (UF §31). Falls back to the raw string when unparsable.
 */
export function formatAuditTimestamp(
  instant: string,
  now: Date = new Date(),
): string {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return instant;

  const time = `${two(at.getHours())}:${two(at.getMinutes())}`;
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );

  if (sameDay(at, now)) return `اليوم ${time}`;
  if (sameDay(at, yesterday)) return `أمس ${time}`;

  const month = TUNISIAN_MONTHS[at.getMonth()];
  const day = `${at.getDate()} ${month}`;
  return at.getFullYear() === now.getFullYear()
    ? `${day} ${time}`
    : `${day} ${at.getFullYear()} ${time}`;
}
