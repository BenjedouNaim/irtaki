import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';

export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusBadgeProps {
  status: string;
  variant?: StatusBadgeVariant;
  dotColor?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const variantStyles: Record<
  StatusBadgeVariant,
  { bg: string; dot: string; text: string; border: string }
> = {
  success: {
    bg: '#f0fdf4',
    dot: '#16a34a',
    text: '#15803d',
    border: '#bbf7d0',
  },
  warning: {
    bg: '#fffbeb',
    dot: '#d97706',
    text: '#b45309',
    border: '#fde68a',
  },
  error: {
    bg: '#fef2f2',
    dot: '#dc2626',
    text: '#b91c1c',
    border: '#fecaca',
  },
  info: {
    bg: '#eff6ff',
    dot: '#2563eb',
    text: '#1d4ed8',
    border: '#bfdbfe',
  },
  neutral: {
    bg: '#f9fafb',
    dot: '#6b7280',
    text: '#374151',
    border: '#e5e7eb',
  },
};

export function StatusBadge({
  status,
  variant = 'neutral',
  dotColor,
  testID,
  style,
  textStyle,
}: StatusBadgeProps) {
  const currentVariant = variantStyles[variant] || variantStyles.neutral;
  const effectiveDotColor = dotColor || currentVariant.dot;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: currentVariant.bg, borderColor: currentVariant.border },
        style,
      ]}
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`الحالة: ${status}`}
    >
      <View
        style={[styles.dot, { backgroundColor: effectiveDotColor }]}
        testID="status-badge-dot"
      />
      <Text style={[styles.text, { color: currentVariant.text }, textStyle]}>
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
