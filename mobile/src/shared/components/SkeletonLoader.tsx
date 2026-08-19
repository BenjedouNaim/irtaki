import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, StyleProp, ViewStyle } from 'react-native';

export type SkeletonVariant = 'row' | 'dashboard';

export interface SkeletonLoaderProps {
  variant?: SkeletonVariant;
  count?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonLoader({
  variant = 'row',
  count = 1,
  testID = 'skeleton-loader',
  style,
}: SkeletonLoaderProps) {
  const animatedValue = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );

    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
    };
  }, [animatedValue]);

  if (variant === 'dashboard') {
    return (
      <View testID={testID} style={[styles.dashboardContainer, style]}>
        <Animated.View
          style={[styles.dashboardHeader, { opacity: animatedValue }]}
        />
        <View style={styles.dashboardGrid}>
          <Animated.View
            style={[styles.dashboardCard, { opacity: animatedValue }]}
          />
          <Animated.View
            style={[styles.dashboardCard, { opacity: animatedValue }]}
          />
        </View>
        <Animated.View
          style={[styles.dashboardChart, { opacity: animatedValue }]}
        />
      </View>
    );
  }

  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <View testID={testID} style={[styles.container, style]}>
      {items.map((key) => (
        <View
          key={key}
          style={styles.rowWrapper}
          testID={`skeleton-row-${key}`}
        >
          <Animated.View
            style={[styles.rowAvatar, { opacity: animatedValue }]}
          />
          <View style={styles.rowContent}>
            <Animated.View
              style={[styles.rowTitle, { opacity: animatedValue }]}
            />
            <Animated.View
              style={[styles.rowSubtitle, { opacity: animatedValue }]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 12,
  },
  rowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    gap: 12,
  },
  rowAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
  },
  rowContent: {
    flex: 1,
    gap: 8,
  },
  rowTitle: {
    width: '60%',
    height: 14,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
  },
  rowSubtitle: {
    width: '40%',
    height: 10,
    borderRadius: 4,
    backgroundColor: '#f3f4f6',
  },
  dashboardContainer: {
    width: '100%',
    padding: 16,
    gap: 16,
  },
  dashboardHeader: {
    width: '50%',
    height: 24,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  dashboardGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  dashboardCard: {
    flex: 1,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  dashboardChart: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
});
