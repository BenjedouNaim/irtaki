import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { AtRiskBadge, AT_RISK_LABEL } from '../AtRiskBadge';

describe('AtRiskBadge (Figma 11:64)', () => {
  it('renders the alert icon + "معرّض للخطر" on the solid error ground', () => {
    render(<AtRiskBadge />);

    const badge = screen.getByTestId('at-risk-badge');
    expect(badge.props.accessibilityLabel).toBe(AT_RISK_LABEL);
    expect(badge.props.className).toContain('bg-error');
    expect(screen.getByText('معرّض للخطر')).toBeTruthy();
    expect(
      screen.getByTestId('at-risk-badge-icon', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});
