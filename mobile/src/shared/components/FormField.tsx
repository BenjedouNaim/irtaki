import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';

export interface FormFieldProps {
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  children: React.ReactNode;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function FormField({
  label,
  required = false,
  helpText,
  error,
  children,
  testID,
  className,
  style,
}: FormFieldProps) {
  const hasError = Boolean(error);

  return (
    <View
      className={`w-full mb-4 ${className ?? ''}`}
      style={style}
      testID={testID}
    >
      <View className="flex-row items-center justify-start mb-1.5">
        <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200 text-right">
          {label}
          {required && <Text className="text-destructive font-bold"> *</Text>}
        </Text>
      </View>

      <View className="w-full">{children}</View>

      {hasError ? (
        <View
          className="flex-row items-center mt-1 gap-1"
          testID="form-field-error"
        >
          <Text
            testID="form-field-error-icon"
            className="text-xs"
            accessibilityLabel="تنبيه"
          >
            ⚠️
          </Text>
          <Text className="text-xs text-destructive text-right">{error}</Text>
        </View>
      ) : helpText ? (
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right"
          testID="form-field-help"
        >
          {helpText}
        </Text>
      ) : null}
    </View>
  );
}
