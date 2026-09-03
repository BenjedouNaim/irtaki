import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';

export interface MetricRowProps {
  label: string;
  /** `null` renders the null-safe placeholder, never `0` (UF §29, §36). */
  value: number | string | null;
  /** Optional context under the label (e.g. "of 6 expected days"). */
  hint?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Shown for a `null` value — a dash, never a fabricated zero (UF §36). */
export const METRIC_NULL_PLACEHOLDER = '—';

/**
 * Metric row (UF §29): "Label + value, null-safe". Used by the Weekly
 * Report and the performance dashboards. Label on the reading side, value
 * on the far side (UF §31); the value tolerates OS text scaling without
 * clipping (UF §32 "especially metric rows"). 48dp minimum height.
 */
export function MetricRow({
  label,
  value,
  hint,
  testID = 'metric-row',
  className,
  style,
}: MetricRowProps) {
  const display = value === null ? METRIC_NULL_PLACEHOLDER : String(value);

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${display}${hint ? `، ${hint}` : ''}`}
      className={`w-full flex-row-reverse items-center justify-between min-h-[48px] px-4 py-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 gap-3 ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="flex-1 gap-0.5">
        <Text
          className="text-base font-semibold text-gray-900 dark:text-gray-100 text-right"
          testID={`${testID}-label`}
          maxFontSizeMultiplier={1.6}
        >
          {label}
        </Text>
        {hint ? (
          <Text
            className="text-xs text-gray-500 dark:text-gray-400 text-right"
            testID={`${testID}-hint`}
            maxFontSizeMultiplier={1.6}
          >
            {hint}
          </Text>
        ) : null}
      </View>
      <Text
        className="text-2xl font-bold text-gray-900 dark:text-gray-100 min-w-[44px] text-left"
        testID={`${testID}-value`}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.6}
      >
        {display}
      </Text>
    </View>
  );
}
