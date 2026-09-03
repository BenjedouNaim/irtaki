import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { ButtonVariant } from './Button';
import { Dialog, DialogWeight } from './Dialog';

export interface ConfirmationDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Kept for existing call sites; maps onto the Figma dialog weight —
   * `destructive` → strong, `secondary` → light, anything else → standard.
   * Prefer `weight` in new code.
   */
  confirmVariant?: ButtonVariant;
  weight?: DialogWeight;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

function weightFor(variant: ButtonVariant): DialogWeight {
  if (variant === 'destructive') return 'strong';
  if (variant === 'secondary') return 'light';
  return 'standard';
}

/**
 * UF §25 confirmation patterns on top of the Figma Dialog (14:90). The API
 * predates the design system; internals now render `Dialog`.
 */
export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  confirmVariant = 'destructive',
  weight,
  loading = false,
  onConfirm,
  onCancel,
  testID = 'confirmation-dialog',
  style,
}: ConfirmationDialogProps) {
  return (
    <Dialog
      visible={visible}
      title={title}
      body={message}
      weight={weight ?? weightFor(confirmVariant)}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
      testID={testID}
      style={style}
    />
  );
}
