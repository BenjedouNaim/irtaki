import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
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

  it('is a plain text tile unless a tap target is given', () => {
    render(<MetricTile label="الطلاب" value={61} />);

    expect(screen.getByTestId('metric-tile').props.accessibilityRole).toBe(
      'text',
    );
  });

  it('becomes a button when a tap target is given', () => {
    const onPress = jest.fn();
    render(<MetricTile label="المجموعات" value={5} onPress={onPress} />);

    const tile = screen.getByTestId('metric-tile');
    expect(tile.props.accessibilityRole).toBe('button');
    expect(tile.props.accessibilityLabel).toBe('المجموعات: 5');
    fireEvent.press(tile);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
