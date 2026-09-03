import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

export interface FormFieldProps {
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  /** Greys the label (the input itself takes `getInputClassName({ disabled })`). */
  disabled?: boolean;
  children: React.ReactNode;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export const INPUT_HEIGHT = 52;

export interface InputState {
  error?: boolean;
  disabled?: boolean;
  focused?: boolean;
}

/**
 * Class string for the 52px field box inside a FormField (Figma FormField
 * 6:53): surface fill + 1px border/default; Focused = 1.5px border/brand;
 * Error = 1.5px border/error; Disabled = subtle fill, text/disabled.
 * Pair with `placeholderTextColor={colors.textTertiary}` and `textAlign="right"`.
 */
export function getInputClassName({
  error,
  disabled,
  focused,
}: InputState = {}) {
  const base = `w-full h-[52px] px-4 rounded-md ${typography.bodyLg} text-right`;
  if (disabled) {
    return `${base} bg-subtle dark:bg-subtle-dark border border-line dark:border-line-dark text-fg-disabled`;
  }
  const border = error
    ? 'border-[1.5px] border-line-error'
    : focused
      ? 'border-[1.5px] border-line-brand dark:border-line-brand-dark'
      : 'border border-line dark:border-line-dark';
  return `${base} bg-surface dark:bg-surface-dark text-fg dark:text-fg-dark ${border}`;
}

/**
 * Figma FormField (6:53): label above (right-aligned, label/md) with a
 * neutral required asterisk trailing it, the input slot, then helper or an
 * icon + text error line (UF §32 — never colour only).
 */
export function FormField({
  label,
  required = false,
  helpText,
  error,
  disabled = false,
  children,
  testID,
  className,
  style,
}: FormFieldProps) {
  const hasError = Boolean(error);

  return (
    <View
      className={`w-full mb-4 gap-2 ${itemsStart} ${className ?? ''}`}
      style={style}
      testID={testID}
    >
      <View className={`${rowStart} items-center gap-1 w-full`}>
        <Text
          className={`${typography.labelMd} text-right ${
            disabled ? 'text-fg-disabled' : 'text-fg dark:text-fg-dark'
          }`}
        >
          {label}
        </Text>
        {required ? (
          <Text
            className={`${typography.labelMd} ${
              hasError
                ? 'text-fg-error'
                : 'text-fg-tertiary dark:text-fg-tertiary-dark'
            }`}
            accessibilityLabel="مطلوب"
          >
            *
          </Text>
        ) : null}
      </View>

      <View className="w-full">{children}</View>

      {hasError ? (
        <View
          className={`${rowStart} items-center gap-1 w-full`}
          testID="form-field-error"
          accessibilityRole="alert"
        >
          <Icon
            name="alert"
            size={16}
            tone="error"
            testID="form-field-error-icon"
            accessibilityLabel="تنبيه"
          />
          <Text
            className={`flex-1 ${typography.bodySm} text-right text-fg-error`}
          >
            {error}
          </Text>
        </View>
      ) : helpText ? (
        <Text
          className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          testID="form-field-help"
        >
          {helpText}
        </Text>
      ) : null}
    </View>
  );
}
