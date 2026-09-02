import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  CompletionRing,
  TOTAL_AHZAB,
  METRIC_MAX_FONT_SIZE_MULTIPLIER,
} from '../CompletionRing';

// Ticks are decorative and deliberately hidden from assistive technology
// (the ring exposes one progressbar with a numeric value instead), so tick
// queries must opt into hidden elements.
const hidden = { includeHiddenElements: true };

function filledTicks(prefix = 'completion-ring') {
  return screen.queryAllByTestId(
    new RegExp(`^${prefix}-tick-\\d+-filled$`),
    hidden,
  );
}

function emptyTicks(prefix = 'completion-ring') {
  return screen.queryAllByTestId(
    new RegExp(`^${prefix}-tick-\\d+-empty$`),
    hidden,
  );
}

describe('CompletionRing', () => {
  it('renders one tick per hizb (60) and fills exactly `completed` of them', () => {
    render(<CompletionRing completed={23} label="حزباً مكتملاً" />);

    expect(TOTAL_AHZAB).toBe(60);
    expect(filledTicks()).toHaveLength(23);
    expect(emptyTicks()).toHaveLength(37);
    expect(
      screen.getByTestId('completion-ring-tick-1-filled', hidden),
    ).toBeTruthy();
    expect(
      screen.getByTestId('completion-ring-tick-23-filled', hidden),
    ).toBeTruthy();
    expect(
      screen.getByTestId('completion-ring-tick-24-empty', hidden),
    ).toBeTruthy();
    expect(
      screen.getByTestId('completion-ring-tick-60-empty', hidden),
    ).toBeTruthy();
  });

  it('shows the real count "completed / total" with Western numerals and the caption', () => {
    render(<CompletionRing completed={23} label="حزباً مكتملاً" />);

    expect(screen.getByTestId('completion-ring-value').props.children).toBe(
      '23 / 60',
    );
    expect(screen.getByText('حزباً مكتملاً')).toBeTruthy();
  });

  it('keeps the centre value inside the ring under large OS text scales (UF §32)', () => {
    render(<CompletionRing completed={23} label="حزباً مكتملاً" />);

    const value = screen.getByTestId('completion-ring-value');
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
    expect(value.props.maxFontSizeMultiplier).toBe(
      METRIC_MAX_FONT_SIZE_MULTIPLIER,
    );

    const label = screen.getByTestId('completion-ring-label');
    expect(label.props.numberOfLines).toBe(2);
    expect(label.props.maxFontSizeMultiplier).toBe(
      METRIC_MAX_FONT_SIZE_MULTIPLIER,
    );
  });

  it('exposes a single accessible progressbar with a numeric value and Arabic label', () => {
    render(<CompletionRing completed={23} label="حزباً مكتملاً" />);

    const ring = screen.getByRole('progressbar');
    expect(ring.props.testID).toBe('completion-ring');
    expect(ring.props.accessible).toBe(true);
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 60, now: 23 });
    expect(ring.props.accessibilityLabel).toBe('حزباً مكتملاً: 23 من 60');

    // Decorative ticks never reach assistive technology.
    expect(screen.queryAllByTestId(/-tick-/)).toHaveLength(0);
  });

  it('renders zero completed as an all-empty ring, not an empty state', () => {
    render(<CompletionRing completed={0} />);

    expect(filledTicks()).toHaveLength(0);
    expect(emptyTicks()).toHaveLength(60);
    expect(screen.getByTestId('completion-ring-value').props.children).toBe(
      '0 / 60',
    );
    expect(screen.queryByTestId('completion-ring-label')).toBeNull();
  });

  it('clamps out-of-range and non-integer input to [0, total]', () => {
    const { rerender } = render(<CompletionRing completed={75} />);
    expect(filledTicks()).toHaveLength(60);
    expect(
      screen.getByTestId('completion-ring').props.accessibilityValue.now,
    ).toBe(60);

    rerender(<CompletionRing completed={-4} />);
    expect(filledTicks()).toHaveLength(0);

    rerender(<CompletionRing completed={12.9} />);
    expect(filledTicks()).toHaveLength(12);
  });

  it('honours a custom total', () => {
    render(<CompletionRing completed={3} total={10} testID="ring" />);

    expect(filledTicks('ring').length + emptyTicks('ring').length).toBe(10);
    expect(screen.getByTestId('ring-value').props.children).toBe('3 / 10');
  });
});
