import React from 'react';
import { View, Text, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { typography } from '@/shared/theme/typography';
import { rowStart, selfStart } from '@/shared/theme/rtl';

/** Figma StatusBadge.Tone — Success · Warning · Error · Info · Neutral. */
export type StatusBadgeVariant =
  'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusBadgeProps {
  status: string;
  variant?: StatusBadgeVariant;
  /** Overrides the tone's dot colour (rare; prefer a variant). */
  dotColor?: string;
  testID?: string;
  className?: string;
  textClassName?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const TONES: Record<
  StatusBadgeVariant,
  { container: string; dot: string; text: string }
> = {
  success: {
    container: 'bg-success-subtle border-line-success',
    dot: 'bg-dot-success',
    text: 'text-fg-success',
  },
  warning: {
    container:
      'bg-warning-subtle dark:bg-warning-subtle-dark border-line-warning dark:border-line-warning-dark',
    dot: 'bg-dot-warning dark:bg-dot-warning-dark',
    text: 'text-fg-warning dark:text-fg-warning-dark',
  },
  error: {
    container: 'bg-error-subtle border-line-error',
    dot: 'bg-dot-error',
    text: 'text-fg-error',
  },
  info: {
    container: 'bg-info-subtle border-line-info',
    dot: 'bg-dot-info',
    text: 'text-fg-info',
  },
  neutral: {
    container:
      'bg-subtle dark:bg-subtle-dark border-line dark:border-line-dark',
    dot: 'bg-dot-neutral',
    text: 'text-fg-secondary dark:text-fg-secondary-dark',
  },
};

/**
 * Figma StatusBadge (11:63): 28px pill, 7px dot + label/sm text, never
 * colour alone (UF §30, §32). Payment, enrollment, lifecycle, join request
 * and membership states.
 */
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
  const tone = TONES[variant] ?? TONES.neutral;

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`الحالة: ${status}`}
      className={`${rowStart} ${selfStart} items-center h-7 rounded-full border ps-2 pe-2.5 gap-1.5 ${
        tone.container
      } ${className ?? ''}`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View
        testID="status-badge-dot"
        className={`w-[7px] h-[7px] rounded-full ${dotColor ? '' : tone.dot}`}
        style={dotColor ? { backgroundColor: dotColor } : undefined}
      />
      <Text
        className={`${typography.labelSm} text-right ${tone.text} ${
          textClassName ?? ''
        }`}
        style={textStyle}
        numberOfLines={1}
        maxFontSizeMultiplier={1.5}
      >
        {status}
      </Text>
    </View>
  );
}
