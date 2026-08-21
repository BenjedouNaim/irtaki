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

export type ButtonVariant = 'primary' | 'destructive' | 'secondary' | 'outline';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  className?: string;
  textClassName?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityRole?: AccessibilityRole;
}

const variantStyles: Record<
  ButtonVariant,
  {
    container: string;
    text: string;
    loadingColor: string;
  }
> = {
  primary: {
    container:
      'bg-primary active:bg-primary-800 dark:bg-primary-600 dark:active:bg-primary-700',
    text: 'text-white',
    loadingColor: '#ffffff',
  },
  destructive: {
    container:
      'bg-destructive active:bg-destructive-800 dark:bg-destructive-600 dark:active:bg-destructive-700',
    text: 'text-white',
    loadingColor: '#ffffff',
  },
  secondary: {
    container:
      'bg-gray-100 active:bg-gray-200 dark:bg-gray-800 dark:active:bg-gray-700',
    text: 'text-gray-900 dark:text-gray-100',
    loadingColor: '#1B2420',
  },
  outline: {
    container:
      'bg-transparent border border-primary dark:border-primary-400 active:bg-primary-50 dark:active:bg-primary-950',
    text: 'text-primary dark:text-primary-400',
    loadingColor: '#0E6B4A',
  },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  testID,
  className,
  textClassName,
  style,
  textStyle,
  accessibilityRole = 'button',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const currentVariant = variantStyles[variant];

  const handlePress = () => {
    if (isDisabled) return;
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Haptics fallback on non-supported platforms
      }
    }
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={`min-h-[48px] min-w-[48px] px-5 py-3 rounded-lg flex-row items-center justify-center active:scale-[0.98] ${
        currentVariant.container
      } ${isDisabled ? 'opacity-50' : ''} ${className ?? ''}`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      {loading ? (
        <ActivityIndicator
          testID="button-loading-indicator"
          size="small"
          color={currentVariant.loadingColor}
        />
      ) : (
        <Text
          className={`text-base font-semibold text-center ${currentVariant.text} ${
            textClassName ?? ''
          }`}
          style={textStyle}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
