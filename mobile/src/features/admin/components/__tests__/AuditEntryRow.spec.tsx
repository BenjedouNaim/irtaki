import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { AuditEntry } from '@/shared/api/audit.client';
import { AuditEntryRow } from '../AuditEntryRow';

jest.mock('@/shared/api/audit.client');

const NOW = new Date(2026, 8, 3, 12, 0, 0);

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'e1',
    actor: { id: 'a1', full_name: 'الشيخ عبد الرحمن' },
    action: 'ENROLLMENT_TOGGLED',
    target_type: 'Group',
    target_id: 'g1',
    occurred_at: new Date(2026, 8, 3, 8, 12, 0).toISOString(),
    ...overrides,
  };
}

describe('AuditEntryRow (SCR-33, Figma 42:607)', () => {
  it('renders the action name, the actor and the timestamp', () => {
    render(<AuditEntryRow entry={entry()} now={NOW} />);

    expect(screen.getByTestId('audit-entry-e1-action').props.children).toBe(
      'تبديل التسجيل',
    );
    expect(screen.getByTestId('audit-entry-e1-actor').props.children).toBe(
      'الشيخ عبد الرحمن',
    );
    expect(screen.getByTestId('audit-entry-e1-timestamp').props.children).toBe(
      'اليوم 08:12',
    );
  });

  it.each([
    ['LOGIN' as const, 'تسجيل الدخول'],
    ['GROUP_CREATED' as const, 'إنشاء مجموعة'],
    ['ENROLLMENT_TOGGLED' as const, 'تبديل التسجيل'],
  ])('names the %s action', (action, label) => {
    render(<AuditEntryRow entry={entry({ action })} now={NOW} />);

    expect(screen.getByTestId('audit-entry-e1-action').props.children).toBe(
      label,
    );
  });

  it('shows the null marker rather than inventing a name (DEC-B04)', () => {
    render(
      <AuditEntryRow
        entry={entry({ actor: { id: 'a1', full_name: null } })}
        now={NOW}
      />,
    );

    expect(screen.getByTestId('audit-entry-e1-actor').props.children).toBe('—');
  });

  it('is not a control — the audit log has no destination (UF §26)', () => {
    render(<AuditEntryRow entry={entry()} now={NOW} />);

    const row = screen.getByTestId('audit-entry-e1');
    expect(row.props.accessibilityRole).toBeUndefined();
    expect(row.props.onStartShouldSetResponder).toBeUndefined();
  });

  it('reads as one label for assistive technology (UF §32)', () => {
    render(<AuditEntryRow entry={entry()} now={NOW} />);

    expect(screen.getByTestId('audit-entry-e1').props.accessibilityLabel).toBe(
      'تبديل التسجيل، الشيخ عبد الرحمن، اليوم 08:12',
    );
  });

  it('lets OS text scaling grow the row without clipping (UF §32)', () => {
    render(<AuditEntryRow entry={entry()} now={NOW} />);

    for (const id of ['action', 'actor', 'timestamp']) {
      expect(
        screen.getByTestId(`audit-entry-e1-${id}`).props.maxFontSizeMultiplier,
      ).toBe(1.6);
    }
  });
});
