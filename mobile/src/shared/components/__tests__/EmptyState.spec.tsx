import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { EmptyState } from '../EmptyState';

describe('EmptyState (Figma 14:91)', () => {
  it('renders the icon ring and one factual line', () => {
    render(<EmptyState message="لا توجد طلبات معلّقة" />);
    expect(screen.getByText('لا توجد طلبات معلّقة')).toBeTruthy();
    expect(
      screen.getByTestId('empty-state-icon', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('accepts a swapped icon and an optional CTA child', () => {
    render(
      <EmptyState message="x" icon="file-text">
        <Text>CTA</Text>
      </EmptyState>,
    );
    expect(screen.getByText('CTA')).toBeTruthy();
  });
});
