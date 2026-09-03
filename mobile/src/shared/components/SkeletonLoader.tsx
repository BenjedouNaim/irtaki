import React, { useEffect } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * - `row`: list rows (avatar + two lines).
 * - `dashboard`: title + two stat cards + one wide block.
 * - `ring`: a metric card built around a circular gauge (title, 176dp circle,
 *   a text line and a notice block) — mirrors the Progress section's layout (UF §22).
 * - `card`: a status/CTA card (badge, title, one text line, one 48dp button)
 *   — mirrors the Daily Report CTA card on Student Home (UF §22).
 * - `reportRow`: a history row (date line + summary line on the reading
 *   side, a type pill on the far side) — mirrors SCR-14's list rows
 *   (UF §22 "Report history (first page): skeleton rows").
 * - `metricRow`: a label/value row (label on the reading side, a short bold
 *   value on the far side) — mirrors the Metric row (UF §29) stack of SCR-12.
 */
export type SkeletonVariant =
  'row' | 'dashboard' | 'ring' | 'card' | 'reportRow' | 'metricRow';

export interface SkeletonLoaderProps {
  variant?: SkeletonVariant;
  count?: number;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonLoader({
  variant = 'row',
  count = 1,
  testID = 'skeleton-loader',
  className,
  style,
}: SkeletonLoaderProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.set(
      withRepeat(
        withSequence(
          withTiming(0.8, { duration: 800 }),
          withTiming(0.3, { duration: 800 }),
        ),
        -1,
        true,
      ),
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
  }));

  if (variant === 'dashboard') {
    return (
      <View
        testID={testID}
        className={`w-full p-4 gap-4 ${className ?? ''}`}
        style={style}
      >
        <Animated.View
          style={[animatedStyle, { borderCurve: 'continuous' }]}
          className="w-1/2 h-6 rounded-md bg-gray-200 dark:bg-gray-700"
        />
        <View className="flex-row gap-3">
          <Animated.View
            style={[animatedStyle, { borderCurve: 'continuous' }]}
            className="flex-1 h-[90px] rounded-lg bg-gray-200 dark:bg-gray-700"
          />
          <Animated.View
            style={[animatedStyle, { borderCurve: 'continuous' }]}
            className="flex-1 h-[90px] rounded-lg bg-gray-200 dark:bg-gray-700"
          />
        </View>
        <Animated.View
          style={[animatedStyle, { borderCurve: 'continuous' }]}
          className="w-full h-40 rounded-lg bg-gray-200 dark:bg-gray-700"
        />
      </View>
    );
  }

  if (variant === 'ring') {
    return (
      <View
        testID={testID}
        className={`w-full p-5 gap-5 items-center ${className ?? ''}`}
        style={style}
      >
        <Animated.View
          testID="skeleton-ring-title"
          style={[animatedStyle, { borderCurve: 'continuous' }]}
          className="w-1/2 h-6 rounded-md bg-gray-200 dark:bg-gray-700"
        />
        <Animated.View
          testID="skeleton-ring-circle"
          style={animatedStyle}
          className="w-44 h-44 rounded-full bg-gray-200 dark:bg-gray-700"
        />
        <View className="w-full gap-2 items-center">
          <Animated.View
            testID="skeleton-ring-line-0"
            style={[animatedStyle, { borderCurve: 'continuous' }]}
            className="w-4/5 h-4 rounded bg-gray-200 dark:bg-gray-700"
          />
          <Animated.View
            testID="skeleton-ring-line-1"
            style={[animatedStyle, { borderCurve: 'continuous' }]}
            className="w-full h-10 rounded-lg bg-gray-100 dark:bg-gray-800"
          />
        </View>
      </View>
    );
  }

  if (variant === 'card') {
    return (
      <View
        testID={testID}
        className={`w-full p-5 gap-3 ${className ?? ''}`}
        style={style}
      >
        <Animated.View
          testID="skeleton-card-badge"
          style={[animatedStyle, { borderCurve: 'continuous' }]}
          className="w-24 h-6 self-start rounded-full bg-gray-200 dark:bg-gray-700"
        />
        <Animated.View
          testID="skeleton-card-title"
          style={[animatedStyle, { borderCurve: 'continuous' }]}
          className="w-3/5 h-6 self-end rounded-md bg-gray-200 dark:bg-gray-700"
        />
        <Animated.View
          testID="skeleton-card-line"
          style={[animatedStyle, { borderCurve: 'continuous' }]}
          className="w-full h-4 rounded bg-gray-100 dark:bg-gray-800"
        />
        <Animated.View
          testID="skeleton-card-button"
          style={[animatedStyle, { borderCurve: 'continuous' }]}
          className="w-full h-12 rounded-lg bg-gray-200 dark:bg-gray-700"
        />
      </View>
    );
  }

  const items = Array.from({ length: count }, (_, i) => i);

  if (variant === 'metricRow') {
    return (
      <View
        testID={testID}
        className={`w-full gap-3 ${className ?? ''}`}
        style={style}
      >
        {items.map((key) => (
          <View
            key={key}
            testID={`skeleton-metric-row-${key}`}
            className="flex-row-reverse items-center justify-between min-h-[48px] px-4 py-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 gap-3"
            style={{ borderCurve: 'continuous' }}
          >
            <Animated.View
              style={[animatedStyle, { borderCurve: 'continuous' }]}
              className="w-3/5 h-4 rounded bg-gray-200 dark:bg-gray-700"
            />
            <Animated.View
              style={[animatedStyle, { borderCurve: 'continuous' }]}
              className="w-10 h-7 rounded-md bg-gray-200 dark:bg-gray-700"
            />
          </View>
        ))}
      </View>
    );
  }

  if (variant === 'reportRow') {
    return (
      <View
        testID={testID}
        className={`w-full gap-3 ${className ?? ''}`}
        style={style}
      >
        {items.map((key) => (
          <View
            key={key}
            testID={`skeleton-report-row-${key}`}
            className="flex-row-reverse items-center justify-between min-h-[64px] px-4 py-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 gap-3"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-1 gap-2 items-end">
              <Animated.View
                style={[animatedStyle, { borderCurve: 'continuous' }]}
                className="w-2/5 h-4 rounded bg-gray-200 dark:bg-gray-700"
              />
              <Animated.View
                style={[animatedStyle, { borderCurve: 'continuous' }]}
                className="w-3/5 h-3 rounded bg-gray-100 dark:bg-gray-800"
              />
            </View>
            <Animated.View
              style={[animatedStyle, { borderCurve: 'continuous' }]}
              className="w-16 h-6 rounded-full bg-gray-200 dark:bg-gray-700"
            />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      testID={testID}
      className={`w-full gap-3 ${className ?? ''}`}
      style={style}
    >
      {items.map((key) => (
        <View
          key={key}
          testID={`skeleton-row-${key}`}
          className="flex-row items-center p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800 gap-3"
          style={{ borderCurve: 'continuous' }}
        >
          <Animated.View
            style={animatedStyle}
            className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700"
          />
          <View className="flex-1 gap-2">
            <Animated.View
              style={[animatedStyle, { borderCurve: 'continuous' }]}
              className="w-3/5 h-3.5 rounded bg-gray-200 dark:bg-gray-700"
            />
            <Animated.View
              style={[animatedStyle, { borderCurve: 'continuous' }]}
              className="w-2/5 h-2.5 rounded bg-gray-100 dark:bg-gray-800"
            />
          </View>
        </View>
      ))}
    </View>
  );
}
