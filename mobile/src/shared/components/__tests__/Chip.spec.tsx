import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Chip } from '../Chip';

describe('Chip (Figma 9:23)', () => {
  it('Ahzab chip is a checkbox toggle with the 48×44 shape', () => {
    const onPress = jest.fn();
    render(<Chip label="12" selected onPress={onPress} testID="chip" />);

    const chip = screen.getByTestId('chip');
    expect(chip.props.accessibilityRole).toBe('checkbox');
    expect(chip.props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
    });
    expect(chip.props.className).toContain('w-12 h-11');
    expect(chip.props.className).toContain('bg-primary');
    fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Ahzab read-only renders filled/empty text without interaction', () => {
    render(<Chip label="12" readOnly testID="chip" />);
    const chip = screen.getByTestId('chip');
    expect(chip.props.accessibilityRole).toBe('text');
    expect(chip.props.onPress).toBeUndefined();
    expect(screen.getByText('12').props.className).toContain(
      'text-fg-tertiary',
    );
  });

  it('Filter chip is a rounded pill with radio semantics', () => {
    render(
      <Chip
        type="filter"
        label="الكل"
        selected={false}
        onPress={jest.fn()}
        testID="f"
      />,
    );
    const chip = screen.getByTestId('f');
    expect(chip.props.accessibilityRole).toBe('radio');
    expect(chip.props.className).toContain('rounded-full');
    expect(chip.props.className).toContain('bg-surface');
  });
});
