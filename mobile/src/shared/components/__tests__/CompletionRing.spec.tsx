import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  CompletionRing,
  TOTAL_AHZAB,
  METRIC_MAX_FONT_SIZE_MULTIPLIER,
} from '../CompletionRing';

const hidden = { includeHiddenElements: true };

describe('CompletionRing (Figma 19:54)', () => {
  it('shows the real count over "من 60 حزبًا" with Western numerals', () => {
    render(<CompletionRing completed={23} label="حزباً مكتملاً" />);

    expect(TOTAL_AHZAB).toBe(60);
    expect(screen.getByTestId('completion-ring-value').props.children).toBe(
      '23',
    );
    expect(screen.getByTestId('completion-ring-caption').props.children).toBe(
      'من 60 حزبًا',
    );
  });

  it('draws a progress arc proportional to completed/total (none at zero, full at total)', () => {
    const { rerender } = render(<CompletionRing completed={23} />);
    expect(screen.getByTestId('completion-ring-progress', hidden)).toBeTruthy();

    rerender(<CompletionRing completed={0} />);
    expect(screen.queryByTestId('completion-ring-progress', hidden)).toBeNull();
    expect(screen.getByTestId('completion-ring-value').props.children).toBe(
      '0',
    );

    rerender(<CompletionRing completed={40} />);
    // > 180° needs the second half-arc.
    expect(
      screen.getByTestId('completion-ring-progress-tail', hidden),
    ).toBeTruthy();
  });

  it('keeps the centre value inside the ring under large OS text scales (UF §32)', () => {
    render(<CompletionRing completed={23} />);

    const value = screen.getByTestId('completion-ring-value');
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
    expect(value.props.maxFontSizeMultiplier).toBe(
      METRIC_MAX_FONT_SIZE_MULTIPLIER,
    );
  });

  it('exposes a single accessible progressbar with a numeric value and Arabic label', () => {
    render(<CompletionRing completed={23} label="حزباً مكتملاً" />);

    const ring = screen.getByRole('progressbar');
    expect(ring.props.testID).toBe('completion-ring');
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 60, now: 23 });
    expect(ring.props.accessibilityLabel).toBe('حزباً مكتملاً: 23 من 60');
    expect(ring.props.style).toEqual(
      expect.arrayContaining([{ width: 120, height: 120 }]),
    );
  });

  it('clamps out-of-range and non-integer input to [0, total] and honours a custom total', () => {
    const { rerender } = render(<CompletionRing completed={75} />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(
      60,
    );

    rerender(<CompletionRing completed={-4} />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(
      0,
    );

    rerender(<CompletionRing completed={12.9} />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(
      12,
    );

    rerender(<CompletionRing completed={3} total={10} testID="ring" />);
    expect(screen.getByTestId('ring-caption').props.children).toBe(
      'من 10 حزبًا',
    );
  });
});
