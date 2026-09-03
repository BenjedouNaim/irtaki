import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StepIndicator, JOIN_STEPS } from '../StepIndicator';

describe('StepIndicator (Figma 17:137)', () => {
  it('step 2: bars 1–2 active, 3 inactive; labels brand / primary / tertiary', () => {
    render(<StepIndicator step={2} />);

    expect(screen.getByTestId('step-indicator-bar-1-active')).toBeTruthy();
    expect(screen.getByTestId('step-indicator-bar-2-active')).toBeTruthy();
    expect(screen.getByTestId('step-indicator-bar-3-inactive')).toBeTruthy();
    expect(screen.getByText(JOIN_STEPS[0]).props.className).toContain(
      'text-brand',
    );
    expect(screen.getByText(JOIN_STEPS[1]).props.className).toContain(
      'text-fg ',
    );
    expect(screen.getByText(JOIN_STEPS[2]).props.className).toContain(
      'text-fg-tertiary',
    );

    const bar = screen.getByRole('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 1, max: 3, now: 2 });
    expect(bar.props.accessibilityLabel).toBe('الخطوة 2 من 3: المجموعات');
  });

  it('renders steps 1 and 3', () => {
    const { rerender } = render(<StepIndicator step={1} />);
    expect(screen.getByTestId('step-indicator-bar-2-inactive')).toBeTruthy();
    rerender(<StepIndicator step={3} />);
    expect(screen.getByTestId('step-indicator-bar-3-active')).toBeTruthy();
  });
});
