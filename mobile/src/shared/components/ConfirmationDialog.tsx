import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Button, ButtonVariant } from './Button';

export interface ConfirmationDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  confirmVariant = 'destructive',
  loading = false,
  onConfirm,
  onCancel,
  testID = 'confirmation-dialog',
  style,
}: ConfirmationDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
      testID={testID}
    >
      <View className="flex-1 items-center justify-center p-5">
        {/* Backdrop overlay */}
        <Pressable
          testID={`${testID}-backdrop`}
          onPress={loading ? undefined : onCancel}
          className="absolute inset-0 bg-black/50"
          accessibilityRole="button"
          accessibilityLabel="إغلاق نافذة التأكيد"
        />

        {/* Modal Card */}
        <View
          className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-800 gap-4 shadow-xl z-10"
          style={[{ borderCurve: 'continuous' }, style]}
          accessibilityRole="alert"
          accessibilityLabel={title}
          testID={`${testID}-container`}
        >
          {/* Header & Title */}
          <View className="gap-2">
            <Text
              className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right leading-6"
              testID={`${testID}-title`}
            >
              {title}
            </Text>
            <Text
              className="text-sm text-gray-600 dark:text-gray-300 text-right leading-5"
              testID={`${testID}-message`}
            >
              {message}
            </Text>
          </View>

          {/* Action Buttons Row (RTL: confirm on right/first, cancel on left/second) */}
          <View className="flex-row-reverse items-center gap-3 pt-2">
            <Button
              label={confirmLabel}
              variant={confirmVariant}
              onPress={onConfirm}
              loading={loading}
              disabled={loading}
              testID={`${testID}-confirm-button`}
              className="flex-1"
            />
            <Button
              label={cancelLabel}
              variant="secondary"
              onPress={onCancel}
              disabled={loading}
              testID={`${testID}-cancel-button`}
              className="flex-1"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
