import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Banner } from './Banner';
import { Button } from './Button';
import { typography } from '@/shared/theme/typography';
import { SHADOW_FLOATING } from '@/shared/theme/colors';
import { itemsStart } from '@/shared/theme/rtl';

/**
 * Figma Dialog.Weight (14:90):
 * - standard: accept/reject request, archive, reassign, promote — primary confirm;
 * - strong: "cannot be undone" (record payment, delete group, remove student) —
 *   body in text/error, destructive confirm;
 * - light: discard report mid-entry — secondary confirm.
 */
export type DialogWeight = 'standard' | 'strong' | 'light';

export interface DialogProps {
  visible: boolean;
  title: string;
  body: string;
  weight?: DialogWeight;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Confirm shows a spinner; cancel and the backdrop are inert. */
  loading?: boolean;
  /**
   * Inline failure of the confirmed action, shown above the buttons as an
   * icon + text Banner (UF §32) so the dialog can stay open for a retry —
   * which UF §18 requires of "Record a payment" on a network/server error.
   */
  error?: string | null;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const CONFIRM_VARIANT = {
  standard: 'primary',
  strong: 'destructive',
  light: 'secondary',
} as const;

export function Dialog({
  visible,
  title,
  body,
  weight = 'standard',
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  onConfirm,
  onCancel,
  loading = false,
  error = null,
  testID = 'dialog',
  style,
}: DialogProps) {
  const strong = weight === 'strong';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
      testID={testID}
    >
      <View className="flex-1 items-center justify-center p-8">
        <Pressable
          testID={`${testID}-backdrop`}
          onPress={loading ? undefined : onCancel}
          className="absolute inset-0 bg-black/50"
          accessibilityRole="button"
          accessibilityLabel="إغلاق نافذة التأكيد"
        />

        <View
          testID={`${testID}-container`}
          accessibilityRole="alert"
          accessibilityLabel={title}
          className={`w-full max-w-[326px] rounded-xl bg-surface dark:bg-surface-dark px-5 pt-6 pb-5 gap-2 ${itemsStart}`}
          style={[SHADOW_FLOATING, { borderCurve: 'continuous' }, style]}
        >
          <Text
            testID={`${testID}-title`}
            className={`w-full ${typography.headingMd} text-right text-fg dark:text-fg-dark`}
          >
            {title}
          </Text>
          <Text
            testID={`${testID}-message`}
            className={`w-full ${typography.bodyMd} text-right ${
              strong
                ? 'text-fg-error'
                : 'text-fg-secondary dark:text-fg-secondary-dark'
            }`}
          >
            {body}
          </Text>

          {error ? (
            <Banner
              message={error}
              tone="error"
              testID={`${testID}-error`}
              className="mt-2"
            />
          ) : null}

          <View className="w-full pt-4 gap-2">
            <Button
              label={confirmLabel}
              variant={CONFIRM_VARIANT[weight]}
              onPress={onConfirm}
              loading={loading}
              disabled={loading}
              testID={`${testID}-confirm-button`}
              className="w-full"
            />
            <Button
              label={cancelLabel}
              variant="ghost"
              onPress={onCancel}
              disabled={loading}
              testID={`${testID}-cancel-button`}
              className="w-full"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
