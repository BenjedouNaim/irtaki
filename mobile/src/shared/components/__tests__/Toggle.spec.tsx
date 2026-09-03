import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Toggle } from '../Toggle';

describe('Toggle (Figma 9:33)', () => {
  it('switch semantics; on = brand track with the knob on the left', () => {
    const onChange = jest.fn();
    render(<Toggle on onChange={onChange} accessibilityLabel="فتح التسجيل" />);

    const sw = screen.getByRole('switch');
    expect(sw.props.accessibilityLabel).toBe('فتح التسجيل');
    expect(sw.props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
    });
    expect(screen.getByTestId('toggle-track').props.className).toContain(
      'bg-primary',
    );
    expect(
      screen.getByTestId('toggle-knob').props.style.transform[0].translateX,
    ).toBeLessThan(0);

    fireEvent.press(sw);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('off = muted track with the knob on the right', () => {
    render(<Toggle on={false} onChange={jest.fn()} accessibilityLabel="x" />);
    expect(screen.getByTestId('toggle-track').props.className).toContain(
      'bg-muted',
    );
    expect(
      screen.getByTestId('toggle-knob').props.style.transform[0].translateX,
    ).toBeGreaterThan(0);
  });
});
