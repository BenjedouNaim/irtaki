import React, { useState } from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button, Banner, Icon, ConfirmationDialog } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import {
  setGroupLifecycle,
  GroupListItemFull,
} from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

export interface GroupLifecyclePanelProps {
  groupId: string;
  lifecycleState: 'Active' | 'Archived';
  /** Names the group in the confirmation title ("أرشفة حلقة الفجر؟"). */
  groupName?: string;
  onChanged?: (updatedGroup: GroupListItemFull) => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma SCR-29 Lifecycle card (41:291 / 52:1054) + Archive confirm
 * (52:971, standard dialog): archive / un-archive with the consequence
 * named in the dialog body (UF §25).
 */
export function GroupLifecyclePanel({
  groupId,
  lifecycleState,
  groupName,
  onChanged,
  className,
  style,
}: GroupLifecyclePanelProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isArchived = lifecycleState === 'Archived';
  const targetState: 'Active' | 'Archived' = isArchived ? 'Active' : 'Archived';
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

  const handleConfirmLifecycleChange = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await setGroupLifecycle(groupId, targetState);

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
      onChanged?.(response.data as GroupListItemFull);
    } catch (err) {
      setShowConfirmModal(false);
      if (err instanceof ApiError) {
        if (err.statusCode === 422 && err.details && err.details.length > 0) {
          setErrorMessage(err.details[0].message);
        } else {
          setErrorMessage(
            err.message || 'حدث خطأ أثناء تعديل دورة حياة المجموعة',
          );
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
      testID="group-lifecycle-panel"
      className={`w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-[18px] py-4 gap-2.5 ${itemsStart} ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <Text
        className={`w-full ${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        دورة الحياة
      </Text>

      {errorMessage ? (
        <Banner
          tone="error"
          icon="alert"
          message={errorMessage}
          testID="group-lifecycle-error"
        />
      ) : null}

      <View className={`${rowStart} items-center gap-3 w-full`}>
        <Icon name="archive" size={20} tone="secondary" />
        <View className={`flex-1 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
          >
            {isArchived ? 'المجموعة مؤرشفة' : 'أرشفة المجموعة'}
          </Text>
          <Text
            className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            {isArchived
              ? 'إلغاء الأرشفة يعيد التقارير والدفع، ولا يعيد الطلبات المرفوضة.'
              : 'ترفض الطلبات المعلّقة، توقف التقارير والدفع. قابلة للعكس.'}
          </Text>
        </View>
        <Button
          label={isArchived ? 'إلغاء الأرشفة' : 'أرشفة'}
          variant="secondary"
          size="small"
          onPress={handleOpenConfirm}
          disabled={isSubmitting}
          testID="toggle-lifecycle-button"
          className="min-w-[120px]"
        />
      </View>

      <ConfirmationDialog
        visible={showConfirmModal}
        title={isArchived ? `إلغاء أرشفة ${subject}؟` : `أرشفة ${subject}؟`}
        message={
          isArchived
            ? 'تعود المجموعة نشطة وتستأنف التقارير والدفع. الطلبات التي رُفضت عند الأرشفة لا تعود.'
            : 'تُرفض الطلبات المعلّقة تلقائيًا، وتتوقف التقارير والدفع. يمكن إلغاء الأرشفة لاحقًا، لكن الطلبات المرفوضة لا تعود.'
        }
        confirmLabel={isArchived ? 'إلغاء الأرشفة' : 'أرشفة'}
        cancelLabel="إلغاء"
        weight="standard"
        loading={isSubmitting}
        onConfirm={handleConfirmLifecycleChange}
        onCancel={() => {
          if (!isSubmitting) setShowConfirmModal(false);
        }}
        testID="lifecycle-confirm-dialog"
      />
    </View>
  );
}
