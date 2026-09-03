import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { FullRing, RingArc } from './ring';
import { typography } from '@/shared/theme/typography';
import { useThemeColors } from '@/shared/theme/colors';

/** The mushaf is divided into 60 ahzab (DBD DB-CHK-19: `ahzab_completed BETWEEN 0 AND 60`). */
export const TOTAL_AHZAB = 60;

/** Figma CompletionRing (19:54) geometry. */
export const COMPLETION_RING_SIZE = 120;
export const COMPLETION_RING_THICKNESS = 12;

export interface CompletionRingProps {
  /** Completed count — a real count, never a percentage (UF §17). */
  completed: number;
  /** Total the ring is divided into; defaults to the 60 ahzab. */
  total?: number;
  /** Outer diameter in dp (Figma: 120). */
  size?: number;
  /** Metric name folded into the accessibility label (e.g. "حزباً مكتملاً"). */
  label?: string;
  /** Caption under the value; defaults to Figma's "من 60 حزبًا". */
  caption?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Cap on OS text scaling for metric values that live inside fixed-size geometry
 * (UF §32 "layouts tolerate OS text-scale increases without clipping — especially
 * metric rows"). Body copy elsewhere scales freely; only metrics are capped.
 */
export const METRIC_MAX_FONT_SIZE_MULTIPLIER = 1.5;

/**
 * Figma CompletionRing (19:54): 120px ring, subtle track, brand progress arc
 * = completed/total advancing clockwise from the top; centre shows the real
 * count (heading/xl) over "من 60 حزبًا" (caption). Never used for the
 * activity pointer. Drawn with plain Views (`./ring`), Western numerals.
 */
export function CompletionRing({
  completed,
  total = TOTAL_AHZAB,
  size = COMPLETION_RING_SIZE,
  label,
  caption,
  testID = 'completion-ring',
  className,
  style,
}: CompletionRingProps) {
  const colors = useThemeColors();
  const safeTotal = Math.max(1, Math.floor(total));
  const safeCompleted = Math.min(
    safeTotal,
    Math.max(0, Math.floor(Number.isFinite(completed) ? completed : 0)),
  );
  const sweep = (safeCompleted / safeTotal) * 360;
  const thickness = Math.round(
    (COMPLETION_RING_THICKNESS * size) / COMPLETION_RING_SIZE,
  );
  const captionText = caption ?? `من ${safeTotal} حزبًا`;
  const accessibilityLabel = `${label ? `${label}: ` : ''}${safeCompleted} من ${safeTotal}`;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: safeTotal, now: safeCompleted }}
      className={`items-center justify-center ${className ?? ''}`}
      style={[{ width: size, height: size }, style]}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, width: size, height: size }}
      >
        <FullRing size={size} thickness={thickness} color={colors.bgSubtle} />
        <RingArc
          testID={`${testID}-progress`}
          size={size}
          thickness={thickness}
          color={colors.bgPrimary}
          startAngle={0}
          sweepAngle={sweep}
        />
      </View>

      {/* Bounded to the inner diameter so the value shrinks under large OS text scales instead of overflowing. */}
      <View
        className="items-center"
        pointerEvents="none"
        style={{ width: size - 2 * (thickness + 6) }}
      >
        <Text
          testID={`${testID}-value`}
          className={`${typography.headingXl} text-center text-fg dark:text-fg-dark`}
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
        >
          {String(safeCompleted)}
        </Text>
        <Text
          testID={`${testID}-caption`}
          className={`${typography.caption} text-center text-fg-secondary dark:text-fg-secondary-dark`}
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
        >
          {captionText}
        </Text>
      </View>
    </View>
  );
}
