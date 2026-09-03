import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders status text and colored dot always paired (never color alone)', async () => {
    await render(<StatusBadge status="مدفوع" variant="success" />);

    expect(screen.getByText('مدفوع')).toBeTruthy();
    expect(screen.getByTestId('status-badge-dot')).toBeTruthy();
  });

  it('supports warning, error, info, and neutral variants', async () => {
    await render(
      <StatusBadge status="متأخر" variant="error" testID="error-badge" />,
    );

    expect(screen.getByTestId('error-badge')).toBeTruthy();
    expect(screen.getByText('متأخر')).toBeTruthy();
  });
});

describe('StatusBadge — Figma 11:63 tones', () => {
  it.each([
    ['success', 'bg-success-subtle'],
    ['warning', 'bg-warning-subtle'],
    ['error', 'bg-error-subtle'],
    ['info', 'bg-info-subtle'],
    ['neutral', 'bg-subtle'],
  ] as const)(
    'renders the %s tone as a 28px pill with a dot',
    async (variant, expected) => {
      await render(<StatusBadge status="س" variant={variant} testID="badge" />);
      const badge = screen.getByTestId('badge');
      expect(badge.props.className).toContain(expected);
      expect(badge.props.className).toContain('h-7');
      expect(badge.props.accessibilityLabel).toBe('الحالة: س');
      expect(screen.getByTestId('status-badge-dot')).toBeTruthy();
    },
  );
});
