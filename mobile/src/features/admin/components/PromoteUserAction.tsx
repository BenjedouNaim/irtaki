import React, { useState } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button, ConfirmationDialog } from '@/shared/components';
import { ApiError } from '@/shared/api/types';
import { PromotableRole, UserListItem } from '@/shared/api/users.client';
import { usePromoteUserRole } from '../hooks/usePromoteUserRole';
import { PromoteRoleSheet, promotableRoleLabel } from './PromoteRoleSheet';

/** Network unavailable (UF §24) — the same copy every other screen uses. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

/** Server error 5xx (UF §24) — generic; the server's own message never shows. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء ترقية المستخدم';

/**
 * BR-R03 — only an account currently holding exactly `role = User` can be
 * promoted, so the action is offered exactly where it would succeed. The
 * Admin's own row is `role = Admin` and therefore never promotable, which is
 * why `403 CANNOT_PROMOTE_SELF` is unreachable from this UI (UF §24) while
 * still being enforced server-side.
 */
export function canPromoteUser(user: Pick<UserListItem, 'role'>): boolean {
  return user.role === 'User';
}

/**
 * Maps a promotion failure to Arabic per UF §24: 5xx and network show the
 * generic retry copy, every 4xx shows the exception filter's own Arabic
 * message (`SOURCE_ROLE_NOT_USER`, `CANNOT_PROMOTE_SELF`) verbatim.
 */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) return SERVER_ERROR_MESSAGE;
    if (error.details && error.details.length > 0) {
      return error.details[0].message;
    }
    return error.message || SERVER_ERROR_MESSAGE;
  }
  return NETWORK_ERROR_MESSAGE;
}

export interface PromoteUserActionProps {
  user: UserListItem;
  /** Fired with the updated user after a successful promotion. */
  onPromoted?: (user: UserListItem) => void;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * SCR-32's promote action (Figma 42:501 + 52:1193): the inline "ترقية" outline
 * button on a `role=User` row, the choose-role sheet it opens, and the
 * standard-weight confirmation UF §25 requires before `PATCH /users/{id}/role`
 * runs. Rows in any other role render nothing here — the list shows their
 * StatusBadge instead.
 */
export function PromoteUserAction({
  user,
  onPromoted,
  testID = 'promote-user',
  className,
  style,
}: PromoteUserActionProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<PromotableRole | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const promotion = usePromoteUserRole();
  const isSubmitting = promotion.isPending;
  const displayName = user.full_name || user.email;

  if (!canPromoteUser(user)) {
    return null;
  }

  const openSheet = () => {
    setSelectedRole(null);
    setErrorMessage(null);
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    if (isSubmitting) return;
    setIsSheetOpen(false);
    setSelectedRole(null);
    setErrorMessage(null);
  };

  const handleSelectRole = (role: PromotableRole) => {
    setSelectedRole(role);
    if (errorMessage) setErrorMessage(null);
  };

  const handleContinue = () => {
    if (!selectedRole) return;
    setIsSheetOpen(false);
    setIsConfirmOpen(true);
  };

  const handleCancelConfirm = () => {
    if (isSubmitting) return;
    setIsConfirmOpen(false);
    setSelectedRole(null);
  };

  const handleConfirm = async () => {
    if (!selectedRole) return;
    try {
      const promoted = await promotion.mutateAsync({
        userId: user.id,
        role: selectedRole,
      });

      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        } catch {
          // Haptics are best-effort.
        }
      }

      setIsConfirmOpen(false);
      setSelectedRole(null);
      onPromoted?.(promoted);
    } catch (err) {
      // The confirmation is spent; the sheet comes back carrying the reason so
      // the Admin can pick a different role or retry with the same context.
      setIsConfirmOpen(false);
      setErrorMessage(describeError(err));
      setIsSheetOpen(true);
    }
  };

  const roleLabel = selectedRole ? promotableRoleLabel(selectedRole) : '';

  return (
    <>
      <Button
        label="ترقية"
        variant="outline"
        size="small"
        onPress={openSheet}
        testID={`${testID}-button`}
        accessibilityLabel={`ترقية ${displayName}`}
        className={`w-[84px] ${className ?? ''}`}
        style={style}
      />

      <PromoteRoleSheet
        visible={isSheetOpen}
        userName={displayName}
        selectedRole={selectedRole}
        onSelectRole={handleSelectRole}
        onContinue={handleContinue}
        onClose={closeSheet}
        busy={isSubmitting}
        error={errorMessage}
        testID={`${testID}-sheet`}
      />

      <ConfirmationDialog
        visible={isConfirmOpen}
        weight="standard"
        title={`ترقية ${displayName} إلى ${roleLabel}؟`}
        message="يصبح مؤهلًا للإسناد إلى مجموعة فورًا. لا يوجد خيار تنزيل في هذه النسخة."
        confirmLabel={`ترقية إلى ${roleLabel}`}
        cancelLabel="إلغاء"
        loading={isSubmitting}
        onConfirm={() => void handleConfirm()}
        onCancel={handleCancelConfirm}
        testID={`${testID}-confirm`}
      />
    </>
  );
}
