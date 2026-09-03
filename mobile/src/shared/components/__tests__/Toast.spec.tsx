import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { Toast, TOAST_DURATION_MS } from '../Toast';

describe('Toast (Figma 11:70)', () => {
  it('renders the message with the circle-check icon as a polite alert', () => {
    render(<Toast message="تم إرسال تقرير اليوم" />);

    const toast = screen.getByTestId('toast');
    expect(toast.props.accessibilityRole).toBe('alert');
    expect(toast.props.className).toContain('bg-inverse');
    expect(screen.getByText('تم إرسال تقرير اليوم').props.numberOfLines).toBe(
      1,
    );
    expect(
      screen.getByTestId('toast-icon', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('auto-dismisses after the duration', () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    render(<Toast message="x" onDismiss={onDismiss} />);

    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
