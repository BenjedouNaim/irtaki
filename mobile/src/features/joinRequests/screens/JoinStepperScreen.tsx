import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Modal } from 'react-native';

import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button } from '@/shared/components/Button';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import {
  listAvailableGroups,
  GroupListItemLimited,
} from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

export const RECITATION_DAYS_MAP: Record<number, string> = {
  1: 'الإثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
  7: 'الأحد',
};

export function getRecitationDayName(day: number): string {
  return RECITATION_DAYS_MAP[day] || `يوم ${day}`;
}

export function JoinStepperScreen() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedGender, setSelectedGender] = useState<
    'Male' | 'Female' | null
  >(null);

  const [groups, setGroups] = useState<GroupListItemLimited[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Group Detail Modal (SCR-07) state
  const [selectedGroup, setSelectedGroup] =
    useState<GroupListItemLimited | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAppliedNotice, setShowAppliedNotice] = useState(false);

  const fetchGroups = useCallback(async (gender: 'Male' | 'Female') => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await listAvailableGroups(gender);
      setGroups(response.data as GroupListItemLimited[]);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل الحلقات المتاحة');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleGenderSelect = (gender: 'Male' | 'Female') => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.selectionAsync();
      } catch {
        // Fallback
      }
    }
    setSelectedGender(gender);
  };

  const handleProceedToStep2 = async () => {
    if (!selectedGender) return;
    setStep(2);
    await fetchGroups(selectedGender);
  };

  const handleBackToStep1 = () => {
    setStep(1);
    setGroups([]);
    setErrorMessage(null);
  };

  const handleOpenGroupDetail = (group: GroupListItemLimited) => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Fallback
      }
    }
    setSelectedGroup(group);
    setShowDetailModal(true);
    setShowAppliedNotice(false);
  };

  const handleApplyGroup = () => {
    setShowAppliedNotice(true);
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-950"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="join-stepper-screen"
    >
      {/* Stepper Header / Progress Indicator */}
      <View
        className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800"
        style={{ borderCurve: 'continuous' }}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-semibold text-primary dark:text-primary-400">
            {step === 1
              ? 'الخطوة 1 من 3: تحديد الجنس'
              : 'الخطوة 2 من 3: اختيار الحلقة'}
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {step === 1 ? '1/3' : '2/3'}
          </Text>
        </View>

        {/* Progress bar */}
        <View className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <View
            className={`h-full bg-primary ${
              step === 1 ? 'w-1/3' : 'w-2/3'
            } rounded-full`}
          />
        </View>
      </View>

      {/* Step 1: Gender Selection */}
      {step === 1 && (
        <View className="gap-4">
          <View>
            <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1 text-right">
              تحديد الجنس
            </Text>
            <Text className="text-sm text-gray-600 dark:text-gray-400 text-right">
              يرجى تحديد الجنس لعرض الحلقات القرآنية المتاحة المناسبة لك
            </Text>
          </View>

          <View className="gap-3">
            <Pressable
              testID="gender-male-option"
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedGender === 'Male' }}
              accessibilityLabel="ذكور"
              onPress={() => handleGenderSelect('Male')}
              className={`p-4 rounded-xl border-2 flex-row items-center justify-between ${
                selectedGender === 'Male'
                  ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                  : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
              }`}
              style={{ borderCurve: 'continuous' }}
            >
              <View
                className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                  selectedGender === 'Male'
                    ? 'border-primary bg-primary'
                    : 'border-gray-400'
                }`}
              >
                {selectedGender === 'Male' && (
                  <View className="w-2.5 h-2.5 rounded-full bg-white" />
                )}
              </View>
              <View className="items-end">
                <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  ذكور (رجال)
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  عرض حلقات الذكور المفتوحة
                </Text>
              </View>
            </Pressable>

            <Pressable
              testID="gender-female-option"
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedGender === 'Female' }}
              accessibilityLabel="إناث"
              onPress={() => handleGenderSelect('Female')}
              className={`p-4 rounded-xl border-2 flex-row items-center justify-between ${
                selectedGender === 'Female'
                  ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                  : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
              }`}
              style={{ borderCurve: 'continuous' }}
            >
              <View
                className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                  selectedGender === 'Female'
                    ? 'border-primary bg-primary'
                    : 'border-gray-400'
                }`}
              >
                {selectedGender === 'Female' && (
                  <View className="w-2.5 h-2.5 rounded-full bg-white" />
                )}
              </View>
              <View className="items-end">
                <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  إناث (نساء)
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  عرض حلقات الإناث المفتوحة
                </Text>
              </View>
            </Pressable>
          </View>

          <Button
            label="التالي: عرض الحلقات المتاحة"
            onPress={handleProceedToStep2}
            disabled={!selectedGender}
            testID="step1-submit-button"
            className="mt-2"
          />

          <Button
            label="إلغاء والعودة للرئيسية"
            variant="outline"
            onPress={() => router.back()}
            testID="cancel-button"
          />
        </View>
      )}

      {/* Step 2: Available Groups List */}
      {step === 2 && (
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Pressable
              testID="change-gender-button"
              onPress={handleBackToStep1}
              className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 active:opacity-70"
              style={{ borderCurve: 'continuous' }}
            >
              <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                تغيير الجنس
              </Text>
            </Pressable>
            <View className="items-end">
              <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 text-right">
                الحلقات المتاحة
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
                الفئة: {selectedGender === 'Male' ? 'ذكور' : 'إناث'}
              </Text>
            </View>
          </View>

          {/* Loading state */}
          {isLoading && (
            <View className="gap-3" testID="groups-loading">
              <SkeletonLoader count={3} />
            </View>
          )}

          {/* Error state */}
          {!isLoading && errorMessage && (
            <View
              className="p-4 rounded-xl bg-destructive-50 border border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800 gap-3"
              style={{ borderCurve: 'continuous' }}
              testID="groups-error-banner"
            >
              <Text className="text-sm font-semibold text-destructive dark:text-destructive-300 text-right">
                {errorMessage}
              </Text>
              <Button
                label="إعادة المحاولة"
                variant="outline"
                onPress={() => selectedGender && fetchGroups(selectedGender)}
                testID="retry-fetch-button"
              />
            </View>
          )}

          {/* Empty state */}
          {!isLoading && !errorMessage && groups.length === 0 && (
            <View
              testID="empty-groups-state"
              className="p-6 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 items-center text-center gap-3 mt-4"
              style={{ borderCurve: 'continuous' }}
            >
              <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center">
                لا توجد حلقات متاحة لـ{' '}
                {selectedGender === 'Male' ? 'الذكور' : 'الإناث'} حالياً
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center leading-5">
                لا توجد حلقات مفتوحة ونشطة تناسب خيارك في الوقت الحالي. يمكنك
                تغيير الجنس أو المحاولة لاحقاً عند فتح حلقات جديدة.
              </Text>
              <Button
                label="تغيير الجنس"
                variant="outline"
                onPress={handleBackToStep1}
                testID="empty-back-button"
                className="mt-2"
              />
            </View>
          )}

          {/* List of groups */}
          {!isLoading && !errorMessage && groups.length > 0 && (
            <View className="gap-3" testID="available-groups-list">
              {groups.map((group) => (
                <Pressable
                  key={group.id}
                  testID={`group-card-${group.id}`}
                  onPress={() => handleOpenGroupDetail(group)}
                  className="p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 active:border-primary dark:active:border-primary-500 gap-2"
                  style={{ borderCurve: 'continuous' }}
                >
                  <View className="flex-row items-center justify-between">
                    <StatusBadge
                      status="مفتوح للتسجيل"
                      variant="success"
                      testID={`status-badge-${group.id}`}
                    />
                    <Text
                      selectable
                      className="text-base font-bold text-gray-900 dark:text-gray-100 text-right"
                    >
                      {group.name}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-end gap-1">
                    <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {getRecitationDayName(group.recitation_day)}
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      يوم التسميع الأسبوعي:
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* Back button */}
          <Button
            label="الرجوع لتحديد الجنس"
            variant="outline"
            onPress={handleBackToStep1}
            testID="step2-back-button"
            className="mt-4"
          />
        </View>
      )}

      {/* SCR-07 Group Detail Sheet Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetailModal(false)}
        testID="group-detail-modal"
      >
        <View className="flex-1 justify-end bg-black/50">
          <View
            className="bg-white dark:bg-gray-900 p-6 rounded-t-3xl border-t border-gray-200 dark:border-gray-800 gap-4"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full self-center mb-1" />

            <View className="flex-row items-center justify-between">
              <StatusBadge status="مفتوح للتسجيل" variant="success" />
              <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 text-right">
                {selectedGroup?.name}
              </Text>
            </View>

            <View className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {selectedGroup
                    ? getRecitationDayName(selectedGroup.recitation_day)
                    : ''}
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  يوم التسميع:
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  قالون عن نافع
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  الرواية:
                </Text>
              </View>
            </View>

            {showAppliedNotice ? (
              <View
                className="p-3 rounded-xl bg-info-50 border border-info-200 dark:bg-info-950 dark:border-info-800"
                style={{ borderCurve: 'continuous' }}
                testID="apply-notice"
              >
                <Text className="text-sm text-info-700 dark:text-info-300 text-right leading-5">
                  تم تحديد هذه الحلقة. ستتمكن من ملء نموذج التقديم (الخطوة 3)
                  عند إطلاق الميزة القادمة.
                </Text>
              </View>
            ) : null}

            <Button
              label="التقديم على هذه الحلقة"
              onPress={handleApplyGroup}
              testID="apply-group-button"
            />

            <Button
              label="إغلاق"
              variant="outline"
              onPress={() => setShowDetailModal(false)}
              testID="close-detail-button"
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
