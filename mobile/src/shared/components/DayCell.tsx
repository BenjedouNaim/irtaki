import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { typography } from '@/shared/theme/typography';

/** Figma DayCell.State — one day in the weekly strip. */
export type DayCellState =
  'reported' | 'excused' | 'missed' | 'today' | 'future' | 'recitation';

export const DAY_CELL_STATE_LABELS: Record<DayCellState, string> = {
  reported: 'تم الإبلاغ',
  excused: 'غياب بعذر',
  missed: 'فائت',
  today: 'اليوم',
  future: 'قادم',
  recitation: 'يوم التسميع',
};

export interface DayCellProps {
  /** Day letter shown above the circle (e.g. "س"). */
  day: string;
  state: DayCellState;
  /** Full day name for assistive tech; falls back to the letter. */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const CIRCLE: Record<DayCellState, string> = {
  reported: 'bg-strip-reported dark:bg-strip-reported-dark',
  excused: 'bg-strip-excused dark:bg-strip-excused-dark',
  missed: 'bg-strip-missed',
  today:
    'bg-transparent border-[1.5px] border-line-brand dark:border-line-brand-dark',
  future: 'bg-strip-future dark:bg-strip-future-dark',
  recitation:
    'bg-accent-subtle dark:bg-accent-subtle-dark border-[1.5px] border-line-warning dark:border-line-warning-dark',
};

/**
 * Figma DayCell (17:38): 40px column — label/sm day letter + 36px circle.
 * Reported = emerald + check, excused = muted grey, missed = rust + x,
 * today = outlined with a brand dot, future = empty, recitation = gold + book.
 * Every state pairs colour with a glyph or outline (UF §32).
 */
export function DayCell({
  day,
  state,
  accessibilityLabel,
  testID = 'day-cell',
  style,
}: DayCellProps) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${accessibilityLabel ?? day}: ${DAY_CELL_STATE_LABELS[state]}`}
      className="w-10 items-center gap-1.5"
      style={style}
    >
      <Text
        testID={`${testID}-day`}
        className={`${typography.labelSm} text-center ${
          state === 'today'
            ? 'text-brand dark:text-brand-dark'
            : 'text-fg-tertiary dark:text-fg-tertiary-dark'
        }`}
        maxFontSizeMultiplier={1.4}
      >
        {day}
      </Text>
      <View
        testID={`${testID}-circle-${state}`}
        className={`w-9 h-9 rounded-full items-center justify-center ${CIRCLE[state]}`}
      >
        {state === 'reported' ? (
          <Icon name="check" size={16} tone="on-primary" />
        ) : state === 'missed' ? (
          <Icon name="x" size={16} tone="on-primary" />
        ) : state === 'recitation' ? (
          <Icon name="book" size={16} tone="accent" />
        ) : state === 'today' ? (
          <View className="w-2 h-2 rounded-full bg-primary dark:bg-primary-dark" />
        ) : null}
      </View>
    </View>
  );
}
