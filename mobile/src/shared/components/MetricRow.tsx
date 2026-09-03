import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

export interface MetricRowProps {
  label: string;
  /** `null` renders the null-safe copy, never `0` (UF §29, §36, DEC-B04). */
  value: number | string | null;
  /** Optional context under the label (e.g. "of 6 expected days"). */
  hint?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Figma MetricRow.Null copy — "insufficient data", never a fabricated zero. */
export const METRIC_NULL_PLACEHOLDER = 'بيانات غير كافية';

/**
 * Figma MetricRow (16:41): 44px row, label (right, body/md secondary) +
 * value (left, heading/md). Null renders "بيانات غير كافية" in body/sm
 * tertiary. The value tolerates OS text scaling without clipping (UF §32).
 */
export function MetricRow({
  label,
  value,
  hint,
  testID = 'metric-row',
  className,
  style,
}: MetricRowProps) {
  const isNull = value === null;
  const display = isNull ? METRIC_NULL_PLACEHOLDER : String(value);

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${display}${hint ? `، ${hint}` : ''}`}
      className={`w-full ${rowStart} items-center justify-between min-h-[44px] gap-3 ${
        className ?? ''
      }`}
      style={style}
    >
      <View className={`flex-1 ${itemsStart}`}>
        <Text
          className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          testID={`${testID}-label`}
          maxFontSizeMultiplier={1.6}
        >
          {label}
        </Text>
        {hint ? (
          <Text
            className={`w-full ${typography.bodySm} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
            testID={`${testID}-hint`}
            maxFontSizeMultiplier={1.6}
          >
            {hint}
          </Text>
        ) : null}
      </View>
      <Text
        className={
          isNull
            ? `${typography.bodySm} text-fg-tertiary dark:text-fg-tertiary-dark text-left`
            : `${typography.headingMd} text-fg dark:text-fg-dark text-left`
        }
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
