import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MetricTile, METRIC_TILE_NULL_VALUE } from '../MetricTile';
import { METRIC_NULL_PLACEHOLDER } from '../MetricRow';

describe('MetricTile (Figma 16:50)', () => {
  it('Value: label, heading/xl value and caption', () => {
    render(
      <MetricTile label="نسبة الالتزام" value="86%" caption="آخر 7 أيام" />,
    );

    expect(screen.getByTestId('metric-tile-value').props.children).toBe('86%');
    expect(
      screen.getByTestId('metric-tile-value').props.adjustsFontSizeToFit,
    ).toBe(true);
    expect(screen.getByTestId('metric-tile-caption').props.children).toBe(
      'آخر 7 أيام',
    );
    expect(screen.getByTestId('metric-tile').props.accessibilityLabel).toBe(
      'نسبة الالتزام: 86%، آخر 7 أيام',
    );
  });

  it('Null: em-dash + "بيانات غير كافية", never 0', () => {
    render(<MetricTile label="النتيجة" value={null} caption="ignored" />);
    expect(screen.getByTestId('metric-tile-value').props.children).toBe(
      METRIC_TILE_NULL_VALUE,
    );
    expect(screen.getByTestId('metric-tile-caption').props.children).toBe(
      METRIC_NULL_PLACEHOLDER,
    );
  });
});
