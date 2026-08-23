import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AhzabChipGrid } from '../AhzabChipGrid';

describe('AhzabChipGrid', () => {
  it('renders all 60 chips and displays initial counter', () => {
    const { getByTestId, getByText } = render(
      <AhzabChipGrid selectedAhzab={[1, 2, 3]} onChange={jest.fn()} />,
    );

    expect(getByTestId('ahzab-counter')).toHaveTextContent('3 / 60 حزباً');
    expect(getByText('(الحد الأدنى 5)')).toBeTruthy();

    for (let i = 1; i <= 60; i++) {
      expect(getByTestId(`ahzab-chip-${i}`)).toBeTruthy();
    }
  });

  it('calls onChange when a chip is toggled on and off', () => {
    const handleChange = jest.fn();
    const { getByTestId } = render(
      <AhzabChipGrid selectedAhzab={[1, 2]} onChange={handleChange} />,
    );

    // Toggle chip 3 on
    fireEvent.press(getByTestId('ahzab-chip-3'));
    expect(handleChange).toHaveBeenCalledWith([1, 2, 3]);

    // Toggle chip 1 off
    fireEvent.press(getByTestId('ahzab-chip-1'));
    expect(handleChange).toHaveBeenCalledWith([2]);
  });

  it('handles "Select All" and "Clear All" buttons', () => {
    const handleChange = jest.fn();
    const { getByTestId } = render(
      <AhzabChipGrid selectedAhzab={[1, 2]} onChange={handleChange} />,
    );

    // Press Select All
    fireEvent.press(getByTestId('ahzab-select-all'));
    expect(handleChange).toHaveBeenCalledWith(
      Array.from({ length: 60 }, (_, i) => i + 1),
    );

    // Press Clear
    fireEvent.press(getByTestId('ahzab-clear-all'));
    expect(handleChange).toHaveBeenCalledWith([]);
  });

  it('hides quick actions and disables toggles when readOnly is true', () => {
    const handleChange = jest.fn();
    const { queryByTestId, getByTestId } = render(
      <AhzabChipGrid
        selectedAhzab={[1, 2]}
        onChange={handleChange}
        readOnly={true}
      />
    );

    expect(queryByTestId('ahzab-select-all')).toBeNull();
    expect(queryByTestId('ahzab-clear-all')).toBeNull();

    fireEvent.press(getByTestId('ahzab-chip-5'));
    expect(handleChange).not.toHaveBeenCalled();
  });
});
