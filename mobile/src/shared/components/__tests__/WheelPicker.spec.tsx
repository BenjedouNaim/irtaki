import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { WheelPicker, WheelPickerItem } from '../WheelPicker';

describe('WheelPicker Component', () => {
  const mockOnChange = jest.fn();

  const items: WheelPickerItem[] = [
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3, disabled: true },
    { label: '4', value: 4 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all item labels', () => {
    render(
      <WheelPicker
        items={items}
        selectedValue={1}
        onValueChange={mockOnChange}
        testID="test-wheel"
      />,
    );

    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('calls onValueChange when an enabled item is pressed', () => {
    render(
      <WheelPicker
        items={items}
        selectedValue={1}
        onValueChange={mockOnChange}
        testID="test-wheel"
      />,
    );

    const item2 = screen.getByTestId('test-wheel-item-2');
    fireEvent.press(item2);

    expect(mockOnChange).toHaveBeenCalledWith(2, 1);
  });

  it('does not call onValueChange when a disabled item is pressed', () => {
    render(
      <WheelPicker
        items={items}
        selectedValue={1}
        onValueChange={mockOnChange}
        testID="test-wheel"
      />,
    );

    const item3 = screen.getByTestId('test-wheel-item-3');
    fireEvent.press(item3);

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('reflects accessibilityState.disabled on disabled items', () => {
    render(
      <WheelPicker
        items={items}
        selectedValue={1}
        onValueChange={mockOnChange}
        testID="test-wheel"
      />,
    );

    const item3 = screen.getByTestId('test-wheel-item-3');
    expect(item3.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    const item1 = screen.getByTestId('test-wheel-item-1');
    expect(item1.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false, selected: true }),
    );
  });
});
