import React, { useMemo } from 'react';
import { View, Text, I18nManager, StyleProp, ViewStyle } from 'react-native';

/** The mushaf is divided into 60 ahzab (DBD DB-CHK-19: `ahzab_completed BETWEEN 0 AND 60`). */
export const TOTAL_AHZAB = 60;

export interface CompletionRingProps {
  /** Completed count — a real count, never a percentage (UF §17). */
  completed: number;
  /** Total the ring is divided into; defaults to the 60 ahzab. */
  total?: number;
  /** Outer diameter in dp. */
  size?: number;
  /** Caption rendered under the "completed / total" value inside the ring. */
  label?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

const TICK_WIDTH = 4;
const TICK_HEIGHT = 14;

/**
 * Completion ring (UF §29 component inventory — "Progress tab (ahzab completed)").
 *
 * Drawn with plain React Native Views (no SVG/chart dependency is part of the stack, SA/TS §6):
 * one tick per unit around the circle, so 60 ahzab render as 60 discrete segments and the
 * ring literally shows the count it labels. Fill advances from the top in reading
 * direction (counter-clockwise under RTL, UF §31), numerals stay Western (UF §31).
 */
export function CompletionRing({
  completed,
  total = TOTAL_AHZAB,
  size = 176,
  label,
  testID = 'completion-ring',
  className,
  style,
}: CompletionRingProps) {
  const safeTotal = Math.max(1, Math.floor(total));
  const safeCompleted = Math.min(
    safeTotal,
    Math.max(0, Math.floor(Number.isFinite(completed) ? completed : 0)),
  );

  const ticks = useMemo(() => {
    const step = 360 / safeTotal;
    const direction = I18nManager.isRTL ? -1 : 1;
    return Array.from({ length: safeTotal }, (_, i) => ({
      index: i + 1,
      rotate: `${direction * i * step}deg`,
    }));
  }, [safeTotal]);

  const valueText = `${safeCompleted} / ${safeTotal}`;
  const accessibilityLabel = label
    ? `${label}: ${safeCompleted} من ${safeTotal}`
    : `${safeCompleted} من ${safeTotal}`;

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
      {ticks.map(({ index, rotate }) => {
        const filled = index <= safeCompleted;
        return (
          <View
            key={index}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID={`${testID}-tick-${index}-${filled ? 'filled' : 'empty'}`}
            style={{
              position: 'absolute',
              top: 0,
              left: size / 2 - TICK_WIDTH / 2,
              width: TICK_WIDTH,
              height: size,
              transform: [{ rotate }],
            }}
          >
            <View
              className={
                filled
                  ? 'bg-primary dark:bg-primary-400'
                  : 'bg-gray-200 dark:bg-gray-700'
              }
              style={{
                width: TICK_WIDTH,
                height: TICK_HEIGHT,
                borderRadius: TICK_WIDTH / 2,
              }}
            />
          </View>
        );
      })}

      <View className="items-center px-6" pointerEvents="none">
        <Text
          testID={`${testID}-value`}
          className="text-3xl font-bold text-gray-900 dark:text-gray-100"
        >
          {valueText}
        </Text>
        {label ? (
          <Text
            testID={`${testID}-label`}
            className="text-xs text-gray-500 dark:text-gray-400 text-center"
          >
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
