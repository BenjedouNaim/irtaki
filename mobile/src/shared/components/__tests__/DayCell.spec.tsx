import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DayCell, DAY_CELL_STATE_LABELS, DayCellState } from '../DayCell';
import { WeeklyStrip } from '../WeeklyStrip';

const STATES: DayCellState[] = [
  'reported',
  'excused',
  'missed',
  'today',
  'future',
  'recitation',
];

describe('DayCell + WeeklyStrip (Figma 17:38, 17:39)', () => {
  it.each(STATES)(
    'renders the %s state with a non-colour cue and a spoken label',
    (state) => {
      render(<DayCell day="س" state={state} accessibilityLabel="السبت" />);

      expect(screen.getByTestId(`day-cell-circle-${state}`)).toBeTruthy();
      expect(screen.getByTestId('day-cell').props.accessibilityLabel).toBe(
        `السبت: ${DAY_CELL_STATE_LABELS[state]}`,
      );
    },
  );

  it('today paints the day letter text/brand; others tertiary', () => {
    const { rerender } = render(<DayCell day="ر" state="today" />);
    expect(screen.getByTestId('day-cell-day').props.className).toContain(
      'text-brand',
    );
    rerender(<DayCell day="ر" state="future" />);
    expect(screen.getByTestId('day-cell-day').props.className).toContain(
      'text-fg-tertiary',
    );
  });

  it('WeeklyStrip renders 7 cells in the given (right-to-left) order', () => {
    const days = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'].map((day, i) => ({
      key: `d${i + 1}`,
      day,
      state: STATES[i % STATES.length],
    }));
    render(<WeeklyStrip days={days} />);

    const strip = screen.getByTestId('weekly-strip');
    expect(strip.props.className).toMatch(/flex-row/);
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByTestId(`weekly-strip-d${i}`)).toBeTruthy();
    }
  });
});
