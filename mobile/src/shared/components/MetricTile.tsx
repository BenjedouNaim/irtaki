import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { typography } from '@/shared/theme/typography';
import { itemsStart } from '@/shared/theme/rtl';
import { METRIC_NULL_PLACEHOLDER } from './MetricRow';

export interface MetricTileProps {
  label: string;
  /** `null` renders an em-dash + "بيانات غير كافية" (Figma MetricTile.Null). */
  value: number | string | null;
  caption?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export const METRIC_TILE_NULL_VALUE = '—';

/**
 * Figma MetricTile (16:50): dashboard tile (2-up grid or full width) —
 * label/sm secondary, heading/xl value, caption tertiary; surface card with a
 * 1px border/default, radius lg.
 */
export function MetricTile({
  label,
  value,
  caption,
  testID = 'metric-tile',
  className,
  style,
}: MetricTileProps) {
  const isNull = value === null;
  const display = isNull ? METRIC_TILE_NULL_VALUE : String(value);
  const captionText = isNull ? METRIC_NULL_PLACEHOLDER : caption;

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${isNull ? METRIC_NULL_PLACEHOLDER : display}${
        !isNull && caption ? `، ${caption}` : ''
      }`}
      className={`flex-1 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-4 pt-4 pb-3.5 gap-1 ${itemsStart} ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <Text
        testID={`${testID}-label`}
        className={`w-full ${typography.labelSm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        maxFontSizeMultiplier={1.5}
      >
        {label}
      </Text>
      <Text
        testID={`${testID}-value`}
        className={`w-full ${typography.headingXl} text-right ${
          isNull
            ? 'text-fg-tertiary dark:text-fg-tertiary-dark'
            : 'text-fg dark:text-fg-dark'
        }`}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.5}
      >
        {display}
      </Text>
      {captionText ? (
        <Text
          testID={`${testID}-caption`}
          className={`w-full ${typography.caption} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
          maxFontSizeMultiplier={1.5}
        >
          {captionText}
        </Text>
      ) : null}
    </View>
  );
}
