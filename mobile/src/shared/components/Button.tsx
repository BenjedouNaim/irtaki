import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  AccessibilityRole,
} from 'react-native';

export type ButtonVariant = 'primary' | 'destructive' | 'secondary' | 'outline';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityRole?: AccessibilityRole;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  testID,
  style,
  textStyle,
  accessibilityRole = 'button',
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        isDisabled && variant === 'destructive' && styles.disabledDestructive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          testID="button-loading-indicator"
          size="small"
          color={variant === 'outline' ? '#0f766e' : '#ffffff'}
        />
      ) : (
        <Text
          style={[
            styles.textBase,
            styles[`${variant}Text` as keyof typeof styles],
            isDisabled && styles.disabledText,
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBase: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  primary: {
    backgroundColor: '#0f766e', // Teal primary
  },
  primaryText: {
    color: '#ffffff',
  },
  destructive: {
    backgroundColor: '#dc2626', // Red
  },
  destructiveText: {
    color: '#ffffff',
  },
  secondary: {
    backgroundColor: '#f3f4f6',
  },
  secondaryText: {
    color: '#1f2937',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#0f766e',
  },
  outlineText: {
    color: '#0f766e',
  },
  disabled: {
    opacity: 0.5,
  },
  disabledDestructive: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.8,
  },
});
