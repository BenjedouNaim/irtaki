import React, { useState } from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Toggle, Icon } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { toggleEnrollment } from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

export interface EnrollmentToggleProps {
  groupId: string;
  enrollmentStatus: 'Open' | 'Closed';
  onToggled?: (newStatus: 'Open' | 'Closed') => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma SCR-23 EnrollmentToggle row (37:160): the Teacher's only write —
 * a Toggle (no confirmation, instantly reversible, UF §16) with the state
 * title and the explanatory caption. Errors stay icon + text (UF §32).
 */
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
    if (isSubmitting) return;
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
            err.message || 'غير مصرح لك بتعديل حالة التسجيل لهذه المجموعة',
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
      className={`w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-[18px] py-2 gap-1 ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className={`${rowStart} items-center gap-3 w-full`}>
        <View className={`flex-1 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
            testID="enrollment-toggle-label"
          >
            {isOpen ? 'التسجيل مفتوح' : 'التسجيل مغلق'}
          </Text>
          <Text
            className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            صلاحيتك الوحيدة للكتابة — بلا تأكيد، قابلة للعكس فورًا
          </Text>
        </View>
        <Toggle
          on={isOpen}
          onChange={handleToggle}
          disabled={isSubmitting}
          accessibilityLabel="التسجيل في المجموعة"
          testID="enrollment-toggle-button"
        />
      </View>

      {errorMessage ? (
        <View
          className={`${rowStart} items-center gap-1 w-full pb-1`}
          accessibilityRole="alert"
        >
          <Icon
            name="alert"
            size={16}
            tone="error"
            accessibilityLabel="تنبيه"
          />
          <Text
            selectable
            className={`flex-1 ${typography.bodySm} text-right text-fg-error`}
            testID="enrollment-toggle-error"
          >
            {errorMessage}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
