import React, { useState } from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button } from '@/shared/components/Button';
import { ConfirmationDialog } from '@/shared/components/ConfirmationDialog';
import {
  setGroupLifecycle,
  GroupListItemFull,
} from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

export interface GroupLifecyclePanelProps {
  groupId: string;
  lifecycleState: 'Active' | 'Archived';
  onChanged?: (updatedGroup: GroupListItemFull) => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function GroupLifecyclePanel({
  groupId,
  lifecycleState,
  onChanged,
  className,
  style,
}: GroupLifecyclePanelProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isArchived = lifecycleState === 'Archived';
  const targetState: 'Active' | 'Archived' = isArchived ? 'Active' : 'Archived';

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
      if (err instanceof ApiError) {
        if (err.statusCode === 422 && err.details && err.details.length > 0) {
          setErrorMessage(err.details[0].message);
        } else {
          setErrorMessage(
            err.message || 'حدث خطأ أثناء تعديل دورة حياة الحلقة',
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
      className={`p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 gap-4 ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="gap-1">
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100 text-right">
          إدارة دورة حياة الحلقة
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400 text-right leading-5">
          {isArchived
            ? 'الحلقة مؤرشفة حالياً وموقوفة عن استقبال الطلبات والتقارير. يمكنك إلغاء الأرشفة لإعادة تفعيلها.'
            : 'الحلقة نشطة حالياً. عند الأرشفة، سيتم إيقاف استقبال الطلبات والتقارير اليومية مع بقاء الطلاب مسجلين.'}
        </Text>
      </View>

      {/* Error Message Banner */}
      {errorMessage ? (
        <View
          className="p-3 rounded-lg bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800"
          style={{ borderCurve: 'continuous' }}
          testID="group-lifecycle-error"
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
        label={isArchived ? 'إلغاء الأرشفة وتفعيل الحلقة' : 'أرشفة الحلقة'}
        variant={isArchived ? 'primary' : 'destructive'}
        onPress={handleOpenConfirm}
        disabled={isSubmitting}
        testID="toggle-lifecycle-button"
      />

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        visible={showConfirmModal}
        title={isArchived ? 'تأكيد تفعيل الحلقة' : 'تأكيد أرشفة الحلقة'}
        message={
          isArchived
            ? 'هل أنت متأكد من رغبتك في إلغاء أرشفة هذه الحلقة وإعادتها إلى الحالة النشطة؟'
            : 'هل أنت متأكد من رغبتك في أرشفة هذه الحلقة؟ سيتم إيقاف استقبال طلبات الانضمام وتعليق تسجيل التقارير اليومية.'
        }
        confirmLabel={isArchived ? 'إلغاء الأرشفة' : 'أرشفة الحلقة'}
        cancelLabel="تراجع"
        confirmVariant={isArchived ? 'primary' : 'destructive'}
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
