import React, { useState } from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button } from '@/shared/components/Button';
import { ConfirmationDialog } from '@/shared/components/ConfirmationDialog';
import { deleteGroup } from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

export interface DeleteGroupPanelProps {
  groupId: string;
  onDeleted?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function DeleteGroupPanel({
  groupId,
  onDeleted,
  className,
  style,
}: DeleteGroupPanelProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      if (err instanceof ApiError) {
        if (
          err.statusCode === 409 ||
          err.errorCode === 'GROUP_HAS_HISTORY' ||
          err.message?.includes('سبق أن انضم')
        ) {
          setErrorMessage('لا يمكن حذف حلقة سبق أن انضم إليها طلاب');
        } else if (err.statusCode === 422 && err.details && err.details.length > 0) {
          setErrorMessage(err.details[0].message);
        } else {
          setErrorMessage(err.message || 'حدث خطأ أثناء حذف الحلقة');
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
      className={`p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 gap-4 ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="gap-1">
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100 text-right">
          حذف الحلقة
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400 text-right leading-5">
          حذف هذه الحلقة نهائياً من النظام. هذا الإجراء متاح فقط للحلقات التي لم ينضم إليها أي طالب سابقاً أو حالياً.
        </Text>
      </View>

      {/* Error Message Banner */}
      {errorMessage ? (
        <View
          className="p-3 rounded-lg bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800"
          style={{ borderCurve: 'continuous' }}
          testID="delete-group-error"
        >
          <Text
            selectable
            className="text-xs text-destructive-700 dark:text-destructive-300 text-right font-medium"
          >
            {errorMessage}
          </Text>
        </View>
      ) : null}

      {/* Action Button */}
      <Button
        label="حذف الحلقة"
        variant="destructive"
        onPress={handleOpenConfirm}
        disabled={isSubmitting}
        testID="delete-group-button"
      />

      {/* Confirmation Dialog (Strongest Copy per UF.md §25) */}
      <ConfirmationDialog
        visible={showConfirmModal}
        title="تأكيد حذف الحلقة"
        message="هل أنت متأكد من رغبتك في حذف هذه الحلقة نهائياً؟ هذا الإجراء لا يمكن التراجع عنه وسيتم حذف بيانات الحلقة بالكامل."
        confirmLabel="حذف نهائي"
        cancelLabel="تراجع"
        confirmVariant="destructive"
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
