import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MetricRow, METRIC_NULL_PLACEHOLDER } from '../MetricRow';

describe('MetricRow (UF §29 "Label + value, null-safe")', () => {
  it('renders the label and the numeric value', () => {
    render(<MetricRow label="التقارير اليومية الفائتة" value={2} />);

    expect(screen.getByTestId('metric-row-label').props.children).toBe(
      'التقارير اليومية الفائتة',
    );
    expect(screen.getByTestId('metric-row-value').props.children).toBe('2');
    expect(screen.queryByTestId('metric-row-hint')).toBeNull();
  });

  it('renders a placeholder for a null value, never 0 (UF §36)', () => {
    render(<MetricRow label="النتيجة" value={null} testID="score" />);

    expect(screen.getByTestId('score-value').props.children).toBe(
      METRIC_NULL_PLACEHOLDER,
    );
    expect(screen.getByTestId('score').props.accessibilityLabel).toBe(
      `النتيجة: ${METRIC_NULL_PLACEHOLDER}`,
    );
  });

  it('shows the hint under the label and folds it into the accessibility label', () => {
    render(
      <MetricRow label="الأيام المتوقعة" value={6} hint="من أصل 6 أيام" />,
    );

    expect(screen.getByTestId('metric-row-hint').props.children).toBe(
      'من أصل 6 أيام',
    );
    expect(screen.getByTestId('metric-row').props.accessibilityLabel).toBe(
      'الأيام المتوقعة: 6، من أصل 6 أيام',
    );
  });

  it('lets the value shrink instead of clipping under OS text scaling (UF §32)', () => {
    render(<MetricRow label="x" value={100} />);

    const value = screen.getByTestId('metric-row-value');
    expect(value.props.adjustsFontSizeToFit).toBe(true);
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.maxFontSizeMultiplier).toBe(1.6);
  });
});
