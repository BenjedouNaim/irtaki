import React from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  AccessibilityRole,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { typography } from '@/shared/theme/typography';
import { useThemeColors } from '@/shared/theme/colors';

/** Figma Button.Variant — Primary · Secondary · Outline · Destructive · Ghost. */
export type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';

/** Figma Button.Size — Large 52px (screen CTAs) · Small 40px (inline row actions). */
export type ButtonSize = 'large' | 'small';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Spinner replaces the label; the control stays disabled while loading. */
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  className?: string;
  textClassName?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
}

interface VariantStyle {
  container: string;
  disabledContainer: string;
  text: string;
  spinner: 'onPrimary' | 'primary' | 'brand';
}

const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: {
    container: 'bg-primary dark:bg-primary-dark active:opacity-90',
    disabledContainer: 'bg-muted dark:bg-muted-dark',
    text: 'text-fg-on-primary',
    spinner: 'onPrimary',
  },
  destructive: {
    container: 'bg-error active:opacity-90',
    disabledContainer: 'bg-muted dark:bg-muted-dark',
    text: 'text-fg-on-primary',
    spinner: 'onPrimary',
  },
  secondary: {
    container:
      'bg-subtle dark:bg-subtle-dark active:bg-muted dark:active:bg-muted-dark',
    disabledContainer: 'bg-subtle dark:bg-subtle-dark',
    text: 'text-fg dark:text-fg-dark',
    spinner: 'primary',
  },
  outline: {
    container:
      'bg-transparent border-[1.5px] border-line-brand dark:border-line-brand-dark active:bg-primary-subtle dark:active:bg-primary-subtle-dark',
    disabledContainer:
      'bg-transparent border-[1.5px] border-line dark:border-line-dark',
    text: 'text-brand dark:text-brand-dark',
    spinner: 'brand',
  },
  ghost: {
    container:
      'bg-transparent active:bg-primary-subtle dark:active:bg-primary-subtle-dark',
    disabledContainer: 'bg-transparent',
    text: 'text-brand dark:text-brand-dark',
    spinner: 'brand',
  },
};

const SIZES: Record<ButtonSize, { container: string; text: string }> = {
  large: { container: 'h-[52px] px-5 rounded-md', text: typography.labelLg },
  small: { container: 'h-10 px-4 rounded-sm', text: typography.labelMd },
};

/** Small buttons are 40px tall; the slop brings the target to 48dp (UF §32). */
const SMALL_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 };

/**
 * Figma Button (5:45). Full-width Large for screen CTAs, Small for inline
 * row actions. Disabled = neutral fill + text/disabled; Loading = spinner
 * replaces the label and the button stays disabled.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  loading = false,
  disabled = false,
  testID,
  className,
  textClassName,
  style,
  textStyle,
  accessibilityRole = 'button',
  accessibilityLabel,
}: ButtonProps) {
  const colors = useThemeColors();
  const isDisabled = disabled || loading;
  const v = VARIANTS[variant];
  const s = SIZES[size];

  const spinnerColor =
    v.spinner === 'onPrimary'
      ? colors.textOnPrimary
      : v.spinner === 'brand'
        ? colors.textBrand
        : colors.textPrimary;

  const handlePress = () => {
    if (isDisabled) return;
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Haptics are best-effort.
      }
    }
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={isDisabled}
      hitSlop={size === 'small' ? SMALL_HIT_SLOP : undefined}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={`min-w-[48px] flex-row items-center justify-center gap-2 ${s.container} ${
        disabled && !loading ? v.disabledContainer : v.container
      } ${className ?? ''}`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      {loading ? (
        <ActivityIndicator
          testID="button-loading-indicator"
          size="small"
          color={spinnerColor}
          style={{ width: 20, height: 20 }}
        />
      ) : (
        <Text
          className={`text-center ${s.text} ${
            disabled ? 'text-fg-disabled' : v.text
          } ${textClassName ?? ''}`}
          style={textStyle}
          numberOfLines={1}
          maxFontSizeMultiplier={1.5}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
