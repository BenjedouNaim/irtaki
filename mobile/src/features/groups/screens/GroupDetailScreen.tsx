import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Button } from '@/shared/components/Button';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { getGroupDetail, GroupListItemFull } from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';
import { getRecitationDayName } from './JoinStepperScreen';

export interface GroupDetailScreenProps {
  groupId: string;
}

export function GroupDetailScreen({ groupId }: GroupDetailScreenProps) {
  const [group, setGroup] = useState<GroupListItemFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getGroupDetail(groupId);
      setGroup(response.data as GroupListItemFull);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل تفاصيل الحلقة');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-950"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="group-detail-screen"
    >
      {isLoading ? (
        <View testID="group-detail-skeleton" className="gap-4">
          <SkeletonLoader variant="dashboard" />
          <SkeletonLoader count={3} variant="row" />
        </View>
      ) : errorMessage ? (
        <View
          className="p-4 rounded-xl bg-destructive-50 border border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800 gap-3"
          style={{ borderCurve: 'continuous' }}
          testID="group-detail-error"
        >
          <Text
            selectable
            className="text-sm font-medium text-destructive-700 dark:text-destructive-300 text-right leading-5"
          >
            {errorMessage}
          </Text>
          <Button
            label="إعادة المحاولة"
            variant="outline"
            onPress={fetchDetail}
            testID="retry-button"
          />
        </View>
      ) : group ? (
        <View className="gap-4">
          {/* Header Card */}
          <View
            className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 gap-3"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row-reverse items-center justify-between">
              <Text
                selectable
                className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right flex-1"
                testID="group-detail-name"
              >
                {group.name}
              </Text>
            </View>

            {/* Badges Row */}
            <View className="flex-row-reverse items-center gap-2 flex-wrap pt-1">
              <StatusBadge
                status={
                  group.enrollment_status === 'Open'
                    ? 'مفتوح للتسجيل'
                    : 'مغلق للتسجيل'
                }
                variant={
                  group.enrollment_status === 'Open' ? 'success' : 'neutral'
                }
                testID="group-detail-enrollment-badge"
              />
              <StatusBadge
                status={group.lifecycle_state === 'Active' ? 'نشطة' : 'مؤرشفة'}
                variant={
                  group.lifecycle_state === 'Active' ? 'info' : 'warning'
                }
                testID="group-detail-lifecycle-badge"
              />
            </View>
          </View>

          {/* Group Details Card */}
          <View
            className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 gap-4"
            style={{ borderCurve: 'continuous' }}
          >
            <Text className="text-base font-bold text-gray-900 dark:text-gray-100 text-right mb-1">
              معلومات الحلقة
            </Text>

            {/* Recitation Day */}
            <View className="flex-row-reverse items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                يوم التسميع
              </Text>
              <Text
                selectable
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                testID="group-detail-recitation-day"
              >
                {getRecitationDayName(group.recitation_day)}
              </Text>
            </View>

            {/* Target Gender */}
            <View className="flex-row-reverse items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                الفئة المستهدفة
              </Text>
              <Text
                selectable
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                testID="group-detail-gender"
              >
                {group.gender === 'Male' ? 'ذكور (بنين)' : 'إناث (بنات)'}
              </Text>
            </View>

            {/* Teacher */}
            <View className="flex-row-reverse items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                المعلم المشرف
              </Text>
              <Text
                selectable
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                testID="group-detail-teacher"
              >
                {group.teacher?.full_name || 'غير محدد'}
              </Text>
            </View>

            {/* Assistant */}
            <View className="flex-row-reverse items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                المساعد الإداري
              </Text>
              <Text
                selectable
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                testID="group-detail-assistant"
              >
                {group.assistant?.full_name || 'غير محدد'}
              </Text>
            </View>

            {/* Riwaya */}
            <View className="flex-row-reverse items-center justify-between py-2">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                الرواية
              </Text>
              <Text
                selectable
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                testID="group-detail-riwaya"
              >
                قالون عن نافع
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
