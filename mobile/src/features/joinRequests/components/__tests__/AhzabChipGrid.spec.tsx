import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AhzabChipGrid } from '../AhzabChipGrid';

describe('AhzabChipGrid (UF §19, Figma 23:363 / 35:261)', () => {
  it('renders all 60 chips with the live counter below the minimum', () => {
    const { getByTestId, getByText } = render(
      <AhzabChipGrid
        label="الأحزاب المحفوظة"
        required
        selectedAhzab={[1, 2, 3]}
        onChange={jest.fn()}
      />,
    );

    expect(getByText('الأحزاب المحفوظة')).toBeTruthy();
    expect(getByTestId('ahzab-counter')).toHaveTextContent(
      '3 محددة · الحد الأدنى 5',
    );

    for (let i = 1; i <= 60; i++) {
      expect(getByTestId(`ahzab-chip-${i}`)).toBeTruthy();
    }
    expect(getByTestId('ahzab-chip-2').props.accessibilityState.checked).toBe(
      true,
    );
    expect(getByTestId('ahzab-chip-4').props.accessibilityState.checked).toBe(
      false,
    );
  });

  it('reports the counter once the minimum is met', () => {
    const { getByTestId } = render(
      <AhzabChipGrid
        selectedAhzab={[1, 2, 3, 4, 5, 6, 7]}
        onChange={jest.fn()}
      />,
    );

    expect(getByTestId('ahzab-counter')).toHaveTextContent(
      '7 محددة · الحد الأدنى 5',
    );
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

  it('renders an icon + text error line under the grid (UF §32)', () => {
    const { getByTestId, getByText } = render(
      <AhzabChipGrid
        selectedAhzab={[]}
        onChange={jest.fn()}
        error="يجب اختيار 5 أحزاب على الأقل"
      />,
    );

    expect(getByTestId('ahzab-chip-grid-error')).toBeTruthy();
    expect(getByText('يجب اختيار 5 أحزاب على الأقل')).toBeTruthy();
  });

  it('is read-only on Applicant Detail: no counter, filled/empty cells, no toggling', () => {
    const handleChange = jest.fn();
    const { queryByTestId, getByTestId } = render(
      <AhzabChipGrid
        selectedAhzab={[1, 2]}
        onChange={handleChange}
        readOnly={true}
      />,
    );

    expect(queryByTestId('ahzab-counter')).toBeNull();
    expect(getByTestId('ahzab-chip-1').props.accessibilityState.selected).toBe(
      true,
    );
    expect(getByTestId('ahzab-chip-5').props.accessibilityState.selected).toBe(
      false,
    );

    fireEvent.press(getByTestId('ahzab-chip-5'));
    expect(handleChange).not.toHaveBeenCalled();
  });
});
