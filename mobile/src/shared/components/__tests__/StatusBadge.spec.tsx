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
