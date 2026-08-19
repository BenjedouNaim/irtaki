import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';

export interface FormFieldProps {
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  children: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function FormField({
  label,
  required = false,
  helpText,
  error,
  children,
  testID,
  style,
}: FormFieldProps) {
  const hasError = Boolean(error);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.requiredAsterisk}> *</Text>}
        </Text>
      </View>

      <View style={styles.inputWrapper}>{children}</View>

      {hasError ? (
        <View style={styles.errorRow} testID="form-field-error">
          <Text style={styles.errorIcon} accessibilityElementsHidden aria-hidden>
            ⚠️
          </Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helpText ? (
        <Text style={styles.helpText} testID="form-field-help">
          {helpText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'right',
  },
  requiredAsterisk: {
    color: '#dc2626',
    fontWeight: '700',
  },
  inputWrapper: {
    width: '100%',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  errorIcon: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'right',
  },
  helpText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'right',
  },
});
