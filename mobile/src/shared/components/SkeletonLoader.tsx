import React, { useEffect } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export type SkeletonVariant = 'row' | 'dashboard';

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

  const items = Array.from({ length: count }, (_, i) => i);

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
