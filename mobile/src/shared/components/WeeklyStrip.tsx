import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { DayCell, DayCellState } from './DayCell';
import { rowStart } from '@/shared/theme/rtl';

export interface WeeklyStripDay {
  key: string;
  day: string;
  state: DayCellState;
  accessibilityLabel?: string;
}

export interface WeeklyStripProps {
  /** Day 1 first — it renders rightmost (UF §31). */
  days: WeeklyStripDay[];
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma WeeklyStrip (17:39): 7 DayCells spread across the width, reading
 * right-to-left. Lives inline on Student Home; each cell's state comes from
 * the live weekly report.
 */
export function WeeklyStrip({
  days,
  testID = 'weekly-strip',
  className,
  style,
}: WeeklyStripProps) {
  return (
    <View
      testID={testID}
      accessibilityLabel="الأسبوع"
      className={`${rowStart} items-start justify-between w-full ${className ?? ''}`}
      style={style}
    >
      {days.map((d) => (
        <DayCell
          key={d.key}
          testID={`${testID}-${d.key}`}
          day={d.day}
          state={d.state}
          accessibilityLabel={d.accessibilityLabel}
        />
      ))}
    </View>
  );
}
