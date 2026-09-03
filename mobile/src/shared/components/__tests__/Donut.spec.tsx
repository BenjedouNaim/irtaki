import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Donut } from '../Donut';

const segments = [
  { key: 'normal', label: 'عادي', value: 14 },
  { key: 'revision', label: 'مراجعة', value: 5 },
  { key: 'excused', label: 'غياب بعذر', value: 3 },
  { key: 'unexcused', label: 'غياب بدون عذر', value: 2 },
  { key: 'missed', label: 'فائت', value: 4 },
];

describe('Donut (Figma 19:60)', () => {
  it('renders one legend row per segment (dot · label · value) and one arc per non-zero segment', () => {
    render(<Donut segments={segments} />);

    for (const s of segments) {
      expect(screen.getByText(s.label)).toBeTruthy();
      expect(
        screen.getByTestId(`donut-legend-${s.key}-value`).props.children,
      ).toBe(String(s.value));
      expect(
        screen.getByTestId(`donut-arc-${s.key}`, {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();
    }
    expect(screen.getByTestId('donut-chart').props.accessibilityLabel).toBe(
      'عادي: 14، مراجعة: 5، غياب بعذر: 3، غياب بدون عذر: 2، فائت: 4',
    );
  });

  it('skips zero segments in the ring but keeps them in the legend', () => {
    render(
      <Donut
        segments={[
          { key: 'a', label: 'أ', value: 0 },
          { key: 'b', label: 'ب', value: 3 },
        ]}
      />,
    );
    expect(
      screen.queryByTestId('donut-arc-a', { includeHiddenElements: true }),
    ).toBeNull();
    expect(
      screen.getByTestId('donut-arc-b', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByText('أ')).toBeTruthy();
  });
});
