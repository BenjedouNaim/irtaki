import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button } from '@/shared/components/Button';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import {
  StatusBadge,
  StatusBadgeVariant,
} from '@/shared/components/StatusBadge';
import {
  getJoinRequestDetail,
  ApplicantProfile,
} from '@/shared/api/joinRequests.client';
import { ApiError } from '@/shared/api/types';
import { AhzabChipGrid } from '../components/AhzabChipGrid';

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toISOString().split('T')[0];
  } catch {
    return isoString;
  }
}

function mapTajweedLevel(level: string): string {
  switch (level) {
    case 'Beginner':
      return 'مبتدئ';
    case 'Intermediate':
      return 'متوسط';
    case 'Advanced':
      return 'متقدم';
    default:
      return level;
  }
}

function mapStatus(status: string): {
  label: string;
  variant: StatusBadgeVariant;
} {
  switch (status) {
    case 'Pending':
      return { label: 'قيد المراجعة', variant: 'warning' };
    case 'Accepted':
      return { label: 'تم القبول', variant: 'success' };
    case 'Rejected':
      return { label: 'لم يتم القبول', variant: 'error' };
    default:
      return { label: status, variant: 'neutral' };
  }
}

export function ApplicantDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const requestId = params.id;

  const [applicant, setApplicant] = useState<ApplicantProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!requestId) {
      setErrorMessage('معرف طلب الانضمام غير صالح');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getJoinRequestDetail(requestId);
      setApplicant(response.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل تفاصيل طلب الانضمام');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  const handleRefresh = useCallback(async () => {
    if (!requestId) return;

    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const response = await getJoinRequestDetail(requestId);
      setApplicant(response.data);
      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {
          // Ignore
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحديث تفاصيل طلب الانضمام');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleBack = () => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Fallback
      }
    }
    router.back();
  };

  const statusConfig = applicant ? mapStatus(applicant.status) : null;

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-950"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="applicant-detail-screen"
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Navigation & Header */}
      <View className="flex-row-reverse items-center justify-between">
        <View className="gap-1 flex-1">
          <Text
            className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right"
            testID="applicant-detail-title"
          >
            الملف الشخصي للمتقدم
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
            مراجعة بيانات التسجيل والأحزاب المحفوظة
          </Text>
        </View>
        <Pressable
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="العودة"
          testID="back-button"
          className="px-3 py-1.5 rounded-lg bg-gray-200/80 dark:bg-gray-800 active:opacity-70 mr-2"
          style={{ borderCurve: 'continuous' }}
        >
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
            رجوع
          </Text>
        </Pressable>
      </View>

      {/* Loading Skeleton */}
      {isLoading ? (
        <View testID="applicant-detail-skeleton" className="gap-4">
          <SkeletonLoader variant="dashboard" count={1} />
          <SkeletonLoader variant="row" count={5} />
        </View>
      ) : errorMessage ? (
        <View
          className="p-4 rounded-xl bg-destructive-50 border border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800 gap-3"
          style={{ borderCurve: 'continuous' }}
          testID="applicant-detail-error"
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
      ) : applicant ? (
        <View className="gap-4" testID="applicant-detail-content">
          {/* Main Info Card */}
          <View
            className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 gap-4"
            style={{ borderCurve: 'continuous' }}
            testID="applicant-profile-card"
          >
            {/* Top row: Name, Status & Score */}
            <View className="flex-row-reverse items-center justify-between gap-2">
              <View className="flex-1">
                <Text
                  selectable
                  className="text-xl font-bold text-gray-900 dark:text-gray-100 text-right"
                  testID="applicant-full-name"
                >
                  {applicant.full_name}
                </Text>
              </View>
              <View className="flex-row-reverse items-center gap-2">
                {statusConfig && (
                  <StatusBadge
                    status={statusConfig.label}
                    variant={statusConfig.variant}
                    testID="applicant-status-badge"
                  />
                )}
                <View
                  className="flex-row-reverse items-center gap-1 px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-950/60 border border-primary-200 dark:border-primary-800"
                  style={{ borderCurve: 'continuous' }}
                  testID="applicant-score-container"
                >
                  <Text className="text-xs text-primary-700 dark:text-primary-300 font-medium">
                    التقييم:
                  </Text>
                  <Text
                    selectable
                    className="text-xs font-bold text-primary-800 dark:text-primary-200"
                    style={{ fontVariant: ['tabular-nums'] }}
                    testID="applicant-score"
                  >
                    {applicant.score}
                  </Text>
                </View>
              </View>
            </View>

            {/* Divider */}
            <View className="h-px bg-gray-100 dark:bg-gray-800 w-full" />

            {/* Label-Value Fields */}
            <View className="gap-3">
              {/* Full Name */}
              <View
                className="flex-row-reverse items-center justify-between py-1"
                testID="row-full-name"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  الاسم الكامل
                </Text>
                <Text
                  selectable
                  className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                  testID="field-full-name"
                >
                  {applicant.full_name}
                </Text>
              </View>

              {/* Gender */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-gender"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  الجنس
                </Text>
                <Text
                  selectable
                  className="text-sm font-medium text-gray-900 dark:text-gray-100"
                  testID="field-gender"
                >
                  {applicant.gender === 'Male'
                    ? 'ذكر'
                    : applicant.gender === 'Female'
                      ? 'أنثى'
                      : applicant.gender}
                </Text>
              </View>

              {/* Age */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-age"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  العمر
                </Text>
                <Text
                  selectable
                  className="text-sm font-medium text-gray-900 dark:text-gray-100"
                  style={{ fontVariant: ['tabular-nums'] }}
                  testID="field-age"
                >
                  {applicant.age} سنة
                </Text>
              </View>

              {/* Phone */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-phone"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  رقم الهاتف
                </Text>
                <Text
                  selectable
                  className="text-sm font-medium text-gray-900 dark:text-gray-100"
                  testID="field-phone"
                >
                  {applicant.phone_number}
                </Text>
              </View>

              {/* City */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-city"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  المدينة
                </Text>
                <Text
                  selectable
                  className="text-sm font-medium text-gray-900 dark:text-gray-100"
                  testID="field-city"
                >
                  {applicant.city}
                </Text>
              </View>

              {/* Occupation */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-occupation"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  المهنة
                </Text>
                <Text
                  selectable
                  className="text-sm font-medium text-gray-900 dark:text-gray-100"
                  testID="field-occupation"
                >
                  {applicant.occupation}
                </Text>
              </View>

              {/* Tajweed Level */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-tajweed-level"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  مستوى التجويد
                </Text>
                <Text
                  selectable
                  className="text-sm font-medium text-gray-900 dark:text-gray-100"
                  testID="field-tajweed-level"
                >
                  {mapTajweedLevel(applicant.tajweed_level)}
                </Text>
              </View>

              {/* Studied Tajweed Theory */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-tajweed-theory"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  دراسة التجويد نظرياً
                </Text>
                <Text
                  selectable
                  className={`text-sm font-semibold ${
                    applicant.studied_tajweed_theory
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                  testID="field-tajweed-theory"
                >
                  {applicant.studied_tajweed_theory ? 'نعم' : 'لا'}
                </Text>
              </View>

              {/* Studied Qalun */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-studied-qalun"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  دراسة رواية قالون
                </Text>
                <Text
                  selectable
                  className={`text-sm font-semibold ${
                    applicant.studied_qalun
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                  testID="field-studied-qalun"
                >
                  {applicant.studied_qalun ? 'نعم' : 'لا'}
                </Text>
              </View>

              {/* Program Goal */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-program-goal"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  الهدف من البرنامج
                </Text>
                <Text
                  selectable
                  className="text-sm font-medium text-gray-900 dark:text-gray-100"
                  testID="field-program-goal"
                >
                  {applicant.program_goal === 'Memorization'
                    ? 'حفظ القرآن الكريم'
                    : applicant.program_goal}
                </Text>
              </View>

              {/* Fee Agreement */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-fee-agreement"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  الموافقة على الرسوم
                </Text>
                <Text
                  selectable
                  className={`text-sm font-semibold ${
                    applicant.fee_agreement
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                  testID="field-fee-agreement"
                >
                  {applicant.fee_agreement ? 'نعم (تمت الموافقة)' : 'لا'}
                </Text>
              </View>

              {/* Created At */}
              <View
                className="flex-row-reverse items-center justify-between py-1 border-t border-gray-100 dark:border-gray-800/60"
                testID="row-created-at"
              >
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  تاريخ التقديم
                </Text>
                <Text
                  selectable
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  testID="field-created-at"
                >
                  {formatDate(applicant.created_at)}
                </Text>
              </View>
            </View>
          </View>

          {/* Memorized Ahzab Section */}
          <View
            className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 gap-3"
            style={{ borderCurve: 'continuous' }}
            testID="applicant-ahzab-section"
          >
            <View className="flex-row-reverse items-center justify-between">
              <Text
                className="text-base font-bold text-gray-900 dark:text-gray-100 text-right"
                testID="applicant-ahzab-title"
              >
                الأحزاب المحفوظة
              </Text>
              <View
                className="px-2.5 py-0.5 rounded-full bg-primary-50 dark:bg-primary-950/60 border border-primary-200 dark:border-primary-800"
                style={{ borderCurve: 'continuous' }}
              >
                <Text
                  className="text-xs font-bold text-primary-700 dark:text-primary-300"
                  style={{ fontVariant: ['tabular-nums'] }}
                  testID="applicant-ahzab-count"
                >
                  {applicant.memorized_ahzab.length} حزباً
                </Text>
              </View>
            </View>

            <AhzabChipGrid
              selectedAhzab={applicant.memorized_ahzab}
              readOnly={true}
              testID="applicant-ahzab-grid"
            />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
