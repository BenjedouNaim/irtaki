import React, { useState } from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { Button } from '@/shared/components/Button';
import { toggleEnrollment } from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

export interface EnrollmentToggleProps {
  groupId: string;
  enrollmentStatus: 'Open' | 'Closed';
  onToggled?: (newStatus: 'Open' | 'Closed') => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function EnrollmentToggle({
  groupId,
  enrollmentStatus,
  onToggled,
  className,
  style,
}: EnrollmentToggleProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isOpen = enrollmentStatus === 'Open';
  const targetStatus: 'Open' | 'Closed' = isOpen ? 'Closed' : 'Open';

  const handleToggle = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await toggleEnrollment(groupId, { enrollment_status: targetStatus });

      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        } catch {
          // Haptics fallback on unsupported platforms
        }
      }

      onToggled?.(targetStatus);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 403) {
          setErrorMessage(
            err.message || 'غير مصرح لك بتعديل حالة التسجيل لهذه الحلقة',
          );
        } else if (err.statusCode === 422) {
          if (err.details && err.details.length > 0) {
            setErrorMessage(err.details[0].message);
          } else {
            setErrorMessage(err.message || 'حالة التسجيل غير صالحة');
          }
        } else {
          setErrorMessage(err.message || 'حدث خطأ أثناء تعديل حالة التسجيل');
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
      testID="enrollment-toggle"
      className={`p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 gap-3 ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="flex-row-reverse items-center justify-between gap-3">
        <StatusBadge
          status={isOpen ? 'مفتوح للتسجيل' : 'مغلق للتسجيل'}
          variant={isOpen ? 'success' : 'neutral'}
          testID="enrollment-toggle-badge"
        />
        <Button
          label={isOpen ? 'إغلاق التسجيل' : 'فتح التسجيل'}
          variant={isOpen ? 'outline' : 'primary'}
          onPress={handleToggle}
          loading={isSubmitting}
          disabled={isSubmitting}
          testID="enrollment-toggle-button"
        />
      </View>

      {errorMessage ? (
        <Text
          selectable
          className="text-xs text-destructive text-right font-medium"
          testID="enrollment-toggle-error"
        >
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}
