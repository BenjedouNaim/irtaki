import React, { useEffect } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

/** Shared pulse for every skeleton block (0.3 → 0.8 opacity, 800ms). */
export function useSkeletonPulse() {
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

  return useAnimatedStyle(() => ({ opacity: opacity.get() }));
}

export interface SkeletonBlockProps {
  /** `muted` (primary lines) or `subtle` (secondary lines / pills). */
  tone?: 'muted' | 'subtle';
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** One pulsing placeholder rectangle in the token palette. */
export function SkeletonBlock({
  tone = 'muted',
  className,
  style,
  testID,
}: SkeletonBlockProps) {
  const pulse = useSkeletonPulse();
  return (
    <Animated.View
      testID={testID}
      style={[pulse, { borderCurve: 'continuous' }, style]}
      className={`${
        tone === 'muted'
          ? 'bg-muted dark:bg-muted-dark'
          : 'bg-subtle dark:bg-subtle-dark'
      } ${className ?? ''}`}
    />
  );
}

export interface SkeletonRowProps {
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma SkeletonRow (14:97): 64px surface card — two text lines (right,
 * 140×12 muted + 90×10 subtle) and a 64×24 pill (left). First-load
 * skeleton for lists and dashboards; never a full-screen spinner (UF §22).
 */
export function SkeletonRow({
  testID = 'skeleton-row',
  className,
  style,
}: SkeletonRowProps) {
  return (
    <View
      testID={testID}
      accessibilityLabel="جارٍ التحميل"
      className={`${rowStart} items-center h-16 px-4 gap-3 w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className={`flex-1 gap-2 ${itemsStart}`}>
        <SkeletonBlock tone="muted" className="w-[140px] h-3 rounded-[6px]" />
        <SkeletonBlock tone="subtle" className="w-[90px] h-2.5 rounded-[5px]" />
      </View>
      <SkeletonBlock tone="subtle" className="w-16 h-6 rounded-[12px]" />
    </View>
  );
}
