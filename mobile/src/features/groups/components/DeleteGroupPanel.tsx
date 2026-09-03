import React, { useState } from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button, Banner, Icon, ConfirmationDialog } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { deleteGroup } from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

export interface DeleteGroupPanelProps {
  groupId: string;
  /** Names the group in the confirmation title ("حذف حلقة الرحمة نهائيًا؟"). */
  groupName?: string;
  onDeleted?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Figma 52:1067 — the group has never had a member: deletion is possible. */
const AVAILABLE_COPY =
  'الحذف نهائي ولا يمكن التراجع عنه — ممكن فقط لمجموعة لم ينضم إليها أحد قط.';
/** Figma 41:309 — the server reported membership history (409). */
const UNAVAILABLE_COPY =
  'غير متاح — للمجموعة سجل عضويات. الحذف ممكن فقط لمجموعة لم ينضم إليها أحد قط.';
const HAS_HISTORY_MESSAGE = 'لا يمكن حذف مجموعة سبق أن انضم إليها طلاب';

/**
 * Figma SCR-29 Danger card (41:303) + Delete confirm (52:1139, strong
 * dialog). The API alone knows whether the group ever had a member
 * (API-018, 409 GROUP_HAS_HISTORY); after that answer the action renders
 * unavailable (40% opacity, inert) exactly as the frame shows.
 */
export function DeleteGroupPanel({
  groupId,
  groupName,
  onDeleted,
  className,
  style,
}: DeleteGroupPanelProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasHistory, setHasHistory] = useState(false);

  const subject = groupName ?? 'المجموعة';

  const triggerHaptic = () => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Ignored on non-supported platforms
      }
    }
  };

  const handleOpenConfirm = () => {
    triggerHaptic();
    setErrorMessage(null);
    setShowConfirmModal(true);
  };

  const handleConfirmDelete = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await deleteGroup(groupId);

      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        } catch {
          // Ignored
        }
      }

      setShowConfirmModal(false);
      onDeleted?.();
    } catch (err) {
      setShowConfirmModal(false);
      if (err instanceof ApiError) {
        if (
          err.statusCode === 409 ||
          err.errorCode === 'GROUP_HAS_HISTORY' ||
          err.message?.includes('سبق أن انضم')
        ) {
          setHasHistory(true);
          setErrorMessage(HAS_HISTORY_MESSAGE);
        } else if (
          err.statusCode === 422 &&
          err.details &&
          err.details.length > 0
        ) {
          setErrorMessage(err.details[0].message);
        } else {
          setErrorMessage(err.message || 'حدث خطأ أثناء حذف المجموعة');
        }
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View
      testID="delete-group-panel"
      className={`w-full rounded-lg bg-error-subtle border border-line-error px-[18px] py-4 gap-2.5 ${itemsStart} ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      {errorMessage ? (
        <Banner
          tone="error"
          icon="alert"
          message={errorMessage}
          testID="delete-group-error"
        />
      ) : null}

      <View className={`${rowStart} items-center gap-3 w-full`}>
        <Icon name="trash" size={20} tone="error" />
        <View className={`flex-1 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.bodyMdMedium} text-right text-fg-error`}
          >
            حذف المجموعة نهائيًا
          </Text>
          <Text
            className={`w-full ${typography.caption} text-right text-fg-error`}
            testID="delete-group-description"
          >
            {hasHistory ? UNAVAILABLE_COPY : AVAILABLE_COPY}
          </Text>
        </View>
        <View
          className={hasHistory ? 'opacity-40' : undefined}
          pointerEvents={hasHistory ? 'none' : 'auto'}
          accessibilityState={{ disabled: hasHistory }}
        >
          <Button
            label="حذف"
            variant="destructive"
            size="small"
            onPress={handleOpenConfirm}
            disabled={isSubmitting}
            testID="delete-group-button"
            className="min-w-[96px]"
          />
        </View>
      </View>

      <ConfirmationDialog
        visible={showConfirmModal}
        title={`حذف ${subject} نهائيًا؟`}
        message="لا يمكن التراجع عن هذا الإجراء. تُحذف المجموعة من القاعدة بالكامل."
        confirmLabel="حذف نهائيًا"
        cancelLabel="إلغاء"
        weight="strong"
        loading={isSubmitting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isSubmitting) setShowConfirmModal(false);
        }}
        testID="delete-group-confirm-dialog"
      />
    </View>
  );
}
