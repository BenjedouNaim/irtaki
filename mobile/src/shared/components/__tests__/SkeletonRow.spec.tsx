import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SkeletonRow } from '../SkeletonRow';

describe('SkeletonRow (Figma 14:97)', () => {
  it('renders a 64px surface card announcing loading', () => {
    render(<SkeletonRow />);
    const row = screen.getByTestId('skeleton-row');
    expect(row.props.accessibilityLabel).toBe('جارٍ التحميل');
    expect(row.props.className).toContain('h-16');
    expect(row.props.className).toContain('bg-surface');
  });
});
