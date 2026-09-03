import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Segment } from './Segment';
import { rowStart } from '@/shared/theme/rtl';

export interface SegmentedControlOption<T extends string | number | boolean> {
  label: string;
  value: T;
}

export interface SegmentedControlProps<T extends string | number | boolean> {
  options: SegmentedControlOption<T>[];
  /** `null` = nothing selected (gate questions start untouched, UF §15). */
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Group label folded into every option's accessibility label (UF §32). */
  accessibilityLabel?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma SegmentedControl (7:28): 46px subtle track, 3px inset, 2px gaps;
 * Count 2 (Yes/No gates), 3 (tajweed level), 4 (period selector). The
 * first option is the rightmost segment (UF §31).
 */
export function SegmentedControl<T extends string | number | boolean>({
  options,
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
  testID = 'segmented-control',
  className,
  style,
}: SegmentedControlProps<T>) {
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className={`${rowStart} items-center w-full h-[46px] p-[3px] gap-[2px] rounded-md bg-subtle dark:bg-subtle-dark ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      {options.map((option) => (
        <Segment
          key={String(option.value)}
          testID={`${testID}-${String(option.value)}`}
          label={option.label}
          selected={value !== null && option.value === value}
          disabled={disabled}
          accessibilityLabel={
            accessibilityLabel
              ? `${accessibilityLabel} ${option.label}`
              : undefined
          }
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}
