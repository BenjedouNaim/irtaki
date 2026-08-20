import React from 'react';
import { View, Text, StyleProp, ViewStyle, TextStyle } from 'react-native';

export type StatusBadgeVariant =
  'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusBadgeProps {
  status: string;
  variant?: StatusBadgeVariant;
  dotColor?: string;
  testID?: string;
  className?: string;
  textClassName?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const variantStyles: Record<
  StatusBadgeVariant,
  {
    container: string;
    dot: string;
    text: string;
  }
> = {
  success: {
    container:
      'bg-success-50 border-success-200 dark:bg-success-950 dark:border-success-800',
    dot: 'bg-success-600 dark:bg-success-400',
    text: 'text-success-700 dark:text-success-300',
  },
  warning: {
    container:
      'bg-warning-50 border-warning-200 dark:bg-warning-950 dark:border-warning-800',
    dot: 'bg-warning-600 dark:bg-warning-400',
    text: 'text-warning-700 dark:text-warning-300',
  },
  error: {
    container:
      'bg-destructive-50 border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800',
    dot: 'bg-destructive-600 dark:bg-destructive-400',
    text: 'text-destructive-700 dark:text-destructive-300',
  },
  info: {
    container:
      'bg-info-50 border-info-200 dark:bg-info-950 dark:border-info-800',
    dot: 'bg-info-600 dark:bg-info-400',
    text: 'text-info-700 dark:text-info-300',
  },
  neutral: {
    container:
      'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700',
    dot: 'bg-gray-500 dark:bg-gray-400',
    text: 'text-gray-700 dark:text-gray-300',
  },
};

export function StatusBadge({
  status,
  variant = 'neutral',
  dotColor,
  testID,
  className,
  textClassName,
  style,
  textStyle,
}: StatusBadgeProps) {
  const currentVariant = variantStyles[variant] || variantStyles.neutral;

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`الحالة: ${status}`}
      className={`flex-row items-center self-start px-2 py-1 rounded-full border gap-1.5 ${
        currentVariant.container
      } ${className ?? ''}`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View
        testID="status-badge-dot"
        className={`w-2 h-2 rounded-full ${dotColor ? '' : currentVariant.dot}`}
        style={dotColor ? { backgroundColor: dotColor } : undefined}
      />
      <Text
        className={`text-xs font-semibold ${currentVariant.text} ${
          textClassName ?? ''
        }`}
        style={textStyle}
      >
        {status}
      </Text>
    </View>
  );
}
