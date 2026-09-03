import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ListRow } from '../ListRow';

describe('ListRow (Figma 16:34)', () => {
  it('Chevron trailing: pressable row with title, subtitle and leading avatar', () => {
    const onPress = jest.fn();
    render(
      <ListRow
        title="حلقة الفجر"
        subtitle="يوم التسميع: السبت"
        onPress={onPress}
      />,
    );

    const row = screen.getByRole('button');
    expect(row.props.accessibilityLabel).toBe('حلقة الفجر، يوم التسميع: السبت');
    expect(row.props.className).toContain('h-[72px]');
    expect(screen.getByTestId('list-row-leading')).toBeTruthy();
    expect(
      screen.getByTestId('list-row-chevron', { includeHiddenElements: true }),
    ).toBeTruthy();
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Badge trailing renders a StatusBadge; None renders neither', () => {
    const { rerender } = render(
      <ListRow
        title="x"
        trailing="badge"
        badge={{ status: 'مدفوع', variant: 'success' }}
      />,
    );
    expect(screen.getByText('مدفوع')).toBeTruthy();
    expect(
      screen.queryByTestId('list-row-chevron', { includeHiddenElements: true }),
    ).toBeNull();

    rerender(<ListRow title="x" trailing="none" leadingIcon={null} />);
    expect(screen.queryByTestId('list-row-badge')).toBeNull();
    expect(screen.queryByTestId('list-row-leading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
