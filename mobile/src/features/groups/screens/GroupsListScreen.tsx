import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button } from '@/shared/components/Button';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { listGroups, GroupListItemFull } from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';
import { getRecitationDayName } from './JoinStepperScreen';

export function GroupsListScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupListItemFull[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await listGroups();
      setGroups(response.data as GroupListItemFull[]);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل قائمة الحلقات');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreateGroup = () => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Fallback
      }
    }
    router.push('/(app)/admin/groups/create');
  };

  const handleGroupPress = (groupId: string) => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Fallback
      }
    }
    router.push({
      pathname: '/(app)/admin/groups/[id]',
      params: { id: groupId },
    });
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-950"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="groups-list-screen"
    >
      {/* Screen Header */}
      <View className="flex-row-reverse items-center justify-between">
        <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right">
          الحلقات
        </Text>
        <Button
          label="إنشاء حلقة جديدة"
          variant="primary"
          onPress={handleCreateGroup}
          testID="create-group-header-button"
        />
      </View>

      {/* State rendering */}
      {isLoading ? (
        <View testID="groups-list-skeleton" className="gap-3">
          <SkeletonLoader variant="row" count={4} />
        </View>
      ) : errorMessage ? (
        <View
          className="p-4 rounded-xl bg-destructive-50 border border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800 gap-3"
          style={{ borderCurve: 'continuous' }}
          testID="groups-list-error"
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
            onPress={fetchGroups}
            testID="retry-button"
          />
        </View>
      ) : groups.length === 0 ? (
        <View
          testID="groups-list-empty"
          className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 items-center text-center gap-3 mt-4"
          style={{ borderCurve: 'continuous' }}
        >
          <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center">
            لا توجد حلقات بعد
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 text-center leading-5">
            لم يتم إنشاء أي حلقة حتى الآن. يمكنك البدء بإنشاء حلقة جديدة الآن.
          </Text>
          <Button
            label="إنشاء حلقة جديدة"
            variant="primary"
            onPress={handleCreateGroup}
            testID="empty-state-create-button"
            className="mt-2"
          />
        </View>
      ) : (
        <View className="gap-3" testID="groups-list-content">
          {groups.map((group) => (
            <Pressable
              key={group.id}
              testID={`group-row-${group.id}`}
              accessibilityRole="button"
              accessibilityLabel={`حلقة ${group.name}`}
              onPress={() => handleGroupPress(group.id)}
              className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 active:border-primary dark:active:border-primary-500 gap-3"
              style={{ borderCurve: 'continuous' }}
            >
              {/* Top row: Name & Badges */}
              <View className="flex-row-reverse items-center justify-between gap-2">
                <Text
                  selectable
                  className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right flex-1"
                  testID={`group-name-${group.id}`}
                >
                  {group.name}
                </Text>
                <View className="flex-row-reverse items-center gap-2 flex-wrap">
                  <StatusBadge
                    status={
                      group.enrollment_status === 'Open'
                        ? 'مفتوح للتسجيل'
                        : 'مغلق للتسجيل'
                    }
                    variant={
                      group.enrollment_status === 'Open' ? 'success' : 'neutral'
                    }
                    testID={`group-enrollment-badge-${group.id}`}
                  />
                  <StatusBadge
                    status={
                      group.lifecycle_state === 'Active' ? 'نشطة' : 'مؤرشفة'
                    }
                    variant={
                      group.lifecycle_state === 'Active' ? 'info' : 'warning'
                    }
                    testID={`group-lifecycle-badge-${group.id}`}
                  />
                </View>
              </View>

              {/* Divider */}
              <View className="h-px bg-gray-100 dark:bg-gray-800 w-full" />

              {/* Details grid */}
              <View className="gap-2">
                <View className="flex-row-reverse items-center justify-between">
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    يوم التسميع:
                  </Text>
                  <Text
                    selectable
                    className="text-xs font-semibold text-gray-800 dark:text-gray-200"
                    testID={`group-recitation-day-${group.id}`}
                  >
                    {getRecitationDayName(group.recitation_day)}
                  </Text>
                </View>

                <View className="flex-row-reverse items-center justify-between">
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    الفئة:
                  </Text>
                  <Text
                    selectable
                    className="text-xs font-semibold text-gray-800 dark:text-gray-200"
                    testID={`group-gender-${group.id}`}
                  >
                    {group.gender === 'Male' ? 'ذكور (بنين)' : 'إناث (بنات)'}
                  </Text>
                </View>

                <View className="flex-row-reverse items-center justify-between">
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    المعلم المشرف:
                  </Text>
                  <Text
                    selectable
                    className="text-xs font-semibold text-gray-800 dark:text-gray-200"
                    testID={`group-teacher-${group.id}`}
                  >
                    {group.teacher?.full_name || 'غير محدد'}
                  </Text>
                </View>

                {group.assistant?.full_name ? (
                  <View className="flex-row-reverse items-center justify-between">
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      المساعد الإداري:
                    </Text>
                    <Text
                      selectable
                      className="text-xs font-semibold text-gray-800 dark:text-gray-200"
                      testID={`group-assistant-${group.id}`}
                    >
                      {group.assistant.full_name}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
