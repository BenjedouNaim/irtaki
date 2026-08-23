import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button } from '@/shared/components/Button';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { FormField } from '@/shared/components/FormField';
import { AhzabChipGrid } from '../components/AhzabChipGrid';
import {
  listAvailableGroups,
  GroupListItemLimited,
} from '@/shared/api/groups.client';
import {
  submitJoinRequest,
  SubmitJoinRequestPayload,
} from '@/shared/api/joinRequests.client';
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

export type TajweedLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export function JoinStepperScreen() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedGender, setSelectedGender] = useState<
    'Male' | 'Female' | null
  >(null);

  const [groups, setGroups] = useState<GroupListItemLimited[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [groupUnavailableNotice, setGroupUnavailableNotice] = useState<
    string | null
  >(null);

  // Group Detail Modal (SCR-07) state
  const [selectedGroup, setSelectedGroup] =
    useState<GroupListItemLimited | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Step 3 Form State
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [occupation, setOccupation] = useState('');
  const [city, setCity] = useState('');
  const [memorizedAhzab, setMemorizedAhzab] = useState<number[]>([]);
  const [tajweedLevel, setTajweedLevel] = useState<TajweedLevel | null>(null);
  const [studiedTajweedTheory, setStudiedTajweedTheory] = useState<
    boolean | null
  >(null);
  const [studiedQalun, setStudiedQalun] = useState<boolean | null>(null);
  const [programGoal, setProgramGoal] = useState<'Memorization' | 'Revision'>(
    'Memorization',
  );
  const [feeAgreement, setFeeAgreement] = useState(false);

  // Submission & Form Errors State
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const triggerHaptic = (type: 'selection' | 'impact' = 'selection') => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        if (type === 'selection') {
          Haptics.selectionAsync();
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } catch {
        // Ignored
      }
    }
  };

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
    triggerHaptic('selection');
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
    setGroupUnavailableNotice(null);
  };

  const handleOpenGroupDetail = (group: GroupListItemLimited) => {
    triggerHaptic('impact');
    setSelectedGroup(group);
    setShowDetailModal(true);
  };

  const handleProceedToStep3 = () => {
    setShowDetailModal(false);
    setFieldErrors({});
    setSubmitError(null);
    setGroupUnavailableNotice(null);
    setStep(3);
  };

  const handleBackToStep2 = () => {
    setStep(2);
    setSubmitError(null);
  };

  // Client-side validation for form readiness
  const isFormValid =
    Boolean(fullName.trim().length >= 3) &&
    Boolean(age.trim() && parseInt(age, 10) > 0) &&
    Boolean(phoneNumber.trim().length >= 8) &&
    Boolean(occupation.trim()) &&
    Boolean(city.trim()) &&
    memorizedAhzab.length >= 5 &&
    tajweedLevel !== null &&
    studiedTajweedTheory !== null &&
    studiedQalun !== null &&
    programGoal === 'Memorization' &&
    feeAgreement === true;

  const handleSubmit = async () => {
    if (!isFormValid || !selectedGroup || !selectedGender || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setSubmitError(null);

    const payload: SubmitJoinRequestPayload = {
      group_id: selectedGroup.id,
      full_name: fullName.trim(),
      gender: selectedGender,
      age: parseInt(age.trim(), 10),
      phone_number: phoneNumber.trim(),
      occupation: occupation.trim(),
      city: city.trim(),
      memorized_ahzab: memorizedAhzab,
      tajweed_level: tajweedLevel,
      studied_tajweed_theory: Boolean(studiedTajweedTheory),
      studied_qalun: Boolean(studiedQalun),
      fee_agreement: feeAgreement,
      program_goal: programGoal,
    };

    try {
      await submitJoinRequest(payload);
      triggerHaptic('impact');
      router.replace('/(app)/user');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.statusCode === 422 && err.details) {
          const errorsMap: Record<string, string> = {};
          for (const detail of err.details) {
            errorsMap[detail.field] = detail.message;
          }
          setFieldErrors(errorsMap);
          setSubmitError(err.message || 'يرجى تصحيح الأخطاء الموضحة أدناه');
        } else if (
          err.statusCode === 409 &&
          err.errorCode === 'GROUP_UNAVAILABLE'
        ) {
          // Group became unavailable -> return to Step 2 and refresh (EC-09)
          setStep(2);
          setGroupUnavailableNotice(
            'هذه الحلقة لم تعد متاحة للتسجيل. يرجى اختيار حلقة أخرى.',
          );
          fetchGroups(selectedGender);
        } else if (err.statusCode === 409) {
          // Duplicate submit race -> silent success per UF.md §13
          router.replace('/(app)/user');
        } else {
          setSubmitError(err.message || 'حدث خطأ أثناء إرسال الطلب');
        }
      } else {
        setSubmitError(
          'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-gray-50 dark:bg-gray-950"
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
        contentInsetAdjustmentBehavior="automatic"
        testID="join-stepper-screen"
        keyboardShouldPersistTaps="handled"
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
                : step === 2
                  ? 'الخطوة 2 من 3: اختيار الحلقة'
                  : 'الخطوة 3 من 3: بيانات التقديم'}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {step === 1 ? '1/3' : step === 2 ? '2/3' : '3/3'}
            </Text>
          </View>

          {/* Progress bar */}
          <View className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <View
              className={`h-full bg-primary ${
                step === 1 ? 'w-1/3' : step === 2 ? 'w-2/3' : 'w-full'
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

            {/* Unavailable Group Notice (EC-09) */}
            {groupUnavailableNotice && (
              <View
                className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-800"
                style={{ borderCurve: 'continuous' }}
                testID="group-unavailable-notice"
              >
                <Text className="text-sm font-semibold text-amber-800 dark:text-amber-200 text-right">
                  {groupUnavailableNotice}
                </Text>
              </View>
            )}

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

        {/* Step 3: Application Profile Form (SCR-06 / UF.md §13) */}
        {step === 3 && (
          <View className="gap-4" testID="step3-profile-form">
            {/* Selected Group Header Card */}
            <View
              className="p-4 rounded-xl bg-primary-50/50 dark:bg-primary-950/40 border border-primary-100 dark:border-primary-900 flex-row items-center justify-between"
              style={{ borderCurve: 'continuous' }}
            >
              <View className="items-start">
                <Text className="text-xs text-primary-700 dark:text-primary-300 font-semibold">
                  يوم التسميع:{' '}
                  {selectedGroup
                    ? getRecitationDayName(selectedGroup.recitation_day)
                    : ''}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  الفئة: {selectedGender === 'Male' ? 'ذكور' : 'إناث'}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  الحلقة المحددة
                </Text>
                <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {selectedGroup?.name}
                </Text>
              </View>
            </View>

            {/* Submit Error Banner */}
            {submitError && (
              <View
                className="p-4 rounded-xl bg-destructive-50 border border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800"
                style={{ borderCurve: 'continuous' }}
                testID="form-error-banner"
              >
                <Text className="text-sm font-semibold text-destructive dark:text-destructive-300 text-right">
                  {submitError}
                </Text>
              </View>
            )}

            {/* Full Name */}
            <FormField
              label="الاسم الكامل"
              required
              error={fieldErrors['full_name']}
              helpText="الاسم واللقب كما هو في الهوية (3–80 حرفاً)"
              testID="field-full-name"
            >
              <TextInput
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  if (fieldErrors['full_name']) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      full_name: undefined as unknown as string,
                    }));
                  }
                }}
                placeholder="مثال: أحمد بن محمد التونسي"
                placeholderTextColor="#9ca3af"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 text-right text-base"
                style={{ borderCurve: 'continuous' }}
                testID="input-full-name"
              />
            </FormField>

            {/* Age */}
            <FormField
              label="العمر"
              required
              error={fieldErrors['age']}
              helpText="العمر بالسنوات"
              testID="field-age"
            >
              <TextInput
                value={age}
                onChangeText={(text) => {
                  setAge(text.replace(/[^0-9]/g, ''));
                  if (fieldErrors['age']) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      age: undefined as unknown as string,
                    }));
                  }
                }}
                placeholder="مثال: 25"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 text-right text-base"
                style={{ borderCurve: 'continuous' }}
                testID="input-age"
              />
            </FormField>

            {/* Phone Number */}
            <FormField
              label="رقم الهاتف"
              required
              error={fieldErrors['phone_number']}
              helpText="رقم تونسي صالح (8 أرقام، اختياري: +216)"
              testID="field-phone-number"
            >
              <TextInput
                value={phoneNumber}
                onChangeText={(text) => {
                  setPhoneNumber(text);
                  if (fieldErrors['phone_number']) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      phone_number: undefined as unknown as string,
                    }));
                  }
                }}
                placeholder="مثال: 98123456 أو +21698123456"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 text-right text-base"
                style={{ borderCurve: 'continuous' }}
                testID="input-phone-number"
              />
            </FormField>

            {/* Occupation */}
            <FormField
              label="المهنة / الصفة"
              required
              error={fieldErrors['occupation']}
              testID="field-occupation"
            >
              <TextInput
                value={occupation}
                onChangeText={(text) => {
                  setOccupation(text);
                  if (fieldErrors['occupation']) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      occupation: undefined as unknown as string,
                    }));
                  }
                }}
                placeholder="مثال: مهندس برمجيات / طالب جامعي"
                placeholderTextColor="#9ca3af"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 text-right text-base"
                style={{ borderCurve: 'continuous' }}
                testID="input-occupation"
              />
            </FormField>

            {/* City */}
            <FormField
              label="المدينة / الولاية"
              required
              error={fieldErrors['city']}
              testID="field-city"
            >
              <TextInput
                value={city}
                onChangeText={(text) => {
                  setCity(text);
                  if (fieldErrors['city']) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      city: undefined as unknown as string,
                    }));
                  }
                }}
                placeholder="مثال: تونس / صفاقس / سوسة"
                placeholderTextColor="#9ca3af"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 text-right text-base"
                style={{ borderCurve: 'continuous' }}
                testID="input-city"
              />
            </FormField>

            {/* Memorized Ahzab Chip Grid */}
            <FormField
              label="الأحزاب المحفوظة سابقاً"
              required
              error={fieldErrors['memorized_ahzab']}
              helpText="يرجى تحديد جميع الأحزاب التي تحفظها حالياً (5 أحزاب على الأقل)"
              testID="field-memorized-ahzab"
            >
              <AhzabChipGrid
                selectedAhzab={memorizedAhzab}
                onChange={(selected) => {
                  setMemorizedAhzab(selected);
                  if (fieldErrors['memorized_ahzab']) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      memorized_ahzab: undefined as unknown as string,
                    }));
                  }
                }}
              />
            </FormField>

            {/* Tajweed Level */}
            <FormField
              label="مستوى التجويد"
              required
              error={fieldErrors['tajweed_level']}
              testID="field-tajweed-level"
            >
              <View className="gap-2">
                {[
                  {
                    key: 'Beginner',
                    label: 'مبتدئ (معرفة أساسية بمخارج الحروف)',
                  },
                  {
                    key: 'Intermediate',
                    label: 'متوسط (تطبيق أحكام النون والميم والمدود)',
                  },
                  {
                    key: 'Advanced',
                    label: 'متقدم (إتقان تام للأحكام والصفات)',
                  },
                ].map((item) => {
                  const isSelected = tajweedLevel === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      testID={`tajweed-option-${item.key}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => {
                        triggerHaptic('selection');
                        setTajweedLevel(item.key as TajweedLevel);
                        if (fieldErrors['tajweed_level']) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            tajweed_level: undefined as unknown as string,
                          }));
                        }
                      }}
                      className={`p-3.5 rounded-xl border flex-row items-center justify-between ${
                        isSelected
                          ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                      }`}
                      style={{ borderCurve: 'continuous' }}
                    >
                      <View
                        className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                          isSelected
                            ? 'border-primary bg-primary'
                            : 'border-gray-400'
                        }`}
                      >
                        {isSelected && (
                          <View className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </View>
                      <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </FormField>

            {/* Studied Tajweed Theory */}
            <FormField
              label="هل درست قواعد التجويد النظرية سابقاً؟"
              required
              error={fieldErrors['studied_tajweed_theory']}
              testID="field-tajweed-theory"
            >
              <View className="flex-row gap-3">
                <Pressable
                  testID="theory-yes"
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: studiedTajweedTheory === true,
                  }}
                  onPress={() => {
                    triggerHaptic('selection');
                    setStudiedTajweedTheory(true);
                  }}
                  className={`flex-1 p-3 rounded-xl border items-center ${
                    studiedTajweedTheory === true
                      ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <Text
                    className={`font-bold ${
                      studiedTajweedTheory === true
                        ? 'text-primary dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    نعم
                  </Text>
                </Pressable>

                <Pressable
                  testID="theory-no"
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: studiedTajweedTheory === false,
                  }}
                  onPress={() => {
                    triggerHaptic('selection');
                    setStudiedTajweedTheory(false);
                  }}
                  className={`flex-1 p-3 rounded-xl border items-center ${
                    studiedTajweedTheory === false
                      ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <Text
                    className={`font-bold ${
                      studiedTajweedTheory === false
                        ? 'text-primary dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    لا
                  </Text>
                </Pressable>
              </View>
            </FormField>

            {/* Studied Qalun */}
            <FormField
              label="هل قرأت أو درست برواية قالون عن نافع سابقاً؟"
              required
              error={fieldErrors['studied_qalun']}
              testID="field-studied-qalun"
            >
              <View className="flex-row gap-3">
                <Pressable
                  testID="qalun-yes"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: studiedQalun === true }}
                  onPress={() => {
                    triggerHaptic('selection');
                    setStudiedQalun(true);
                  }}
                  className={`flex-1 p-3 rounded-xl border items-center ${
                    studiedQalun === true
                      ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <Text
                    className={`font-bold ${
                      studiedQalun === true
                        ? 'text-primary dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    نعم
                  </Text>
                </Pressable>

                <Pressable
                  testID="qalun-no"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: studiedQalun === false }}
                  onPress={() => {
                    triggerHaptic('selection');
                    setStudiedQalun(false);
                  }}
                  className={`flex-1 p-3 rounded-xl border items-center ${
                    studiedQalun === false
                      ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <Text
                    className={`font-bold ${
                      studiedQalun === false
                        ? 'text-primary dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    لا
                  </Text>
                </Pressable>
              </View>
            </FormField>

            {/* Program Goal */}
            <FormField
              label="هدف البرنامج المطلوب"
              required
              error={fieldErrors['program_goal']}
              testID="field-program-goal"
            >
              <View className="gap-2">
                <Pressable
                  testID="goal-memorization"
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: programGoal === 'Memorization',
                  }}
                  onPress={() => {
                    triggerHaptic('selection');
                    setProgramGoal('Memorization');
                  }}
                  className={`p-3.5 rounded-xl border flex-row items-center justify-between ${
                    programGoal === 'Memorization'
                      ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <View
                    className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                      programGoal === 'Memorization'
                        ? 'border-primary bg-primary'
                        : 'border-gray-400'
                    }`}
                  >
                    {programGoal === 'Memorization' && (
                      <View className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </View>
                  <View className="items-end">
                    <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      حفظ جديد ومتابعة يومية
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      البرنامج الأساسي للجمعية
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  testID="goal-revision"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: programGoal === 'Revision' }}
                  onPress={() => {
                    triggerHaptic('selection');
                    setProgramGoal('Revision');
                  }}
                  className={`p-3.5 rounded-xl border flex-row items-center justify-between ${
                    programGoal === 'Revision'
                      ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/40'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <View
                    className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                      programGoal === 'Revision'
                        ? 'border-amber-500 bg-amber-500'
                        : 'border-gray-400'
                    }`}
                  >
                    {programGoal === 'Revision' && (
                      <View className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </View>
                  <View className="items-end">
                    <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      مراجعة وتثبيت فقط
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      برنامج غير متاح حالياً
                    </Text>
                  </View>
                </Pressable>
              </View>

              {/* BR-36 inline block explanation */}
              {programGoal === 'Revision' && (
                <View
                  className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-800"
                  style={{ borderCurve: 'continuous' }}
                  testID="revision-block-notice"
                >
                  <Text className="text-xs text-amber-800 dark:text-amber-200 text-right leading-5 font-semibold">
                    عذراً، التسجيل متاح حالياً فقط لبرنامج الحفظ والمتابعة
                    اليومية. لا يمكن قبول طلبات المراجعة فقط في هذا الوقت.
                  </Text>
                </View>
              )}
            </FormField>

            {/* Fee Agreement */}
            <FormField
              label="الرسوم والالتزام المالي"
              required
              error={fieldErrors['fee_agreement']}
              testID="field-fee-agreement"
            >
              <Pressable
                testID="fee-agreement-checkbox"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: feeAgreement }}
                onPress={() => {
                  triggerHaptic('selection');
                  setFeeAgreement(!feeAgreement);
                  if (fieldErrors['fee_agreement']) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      fee_agreement: undefined as unknown as string,
                    }));
                  }
                }}
                className={`p-4 rounded-xl border flex-row items-center justify-between ${
                  feeAgreement
                    ? 'border-primary bg-primary-50/30 dark:bg-primary-950/30'
                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
                }`}
                style={{ borderCurve: 'continuous' }}
              >
                <View
                  className={`w-6 h-6 rounded-md border-2 items-center justify-center ${
                    feeAgreement
                      ? 'border-primary bg-primary'
                      : 'border-gray-400 bg-transparent'
                  }`}
                >
                  {feeAgreement && (
                    <Text className="text-white text-xs font-bold">✓</Text>
                  )}
                </View>

                <View className="flex-1 mr-3 items-end">
                  <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right leading-5">
                    أوافق وأتعهد بالالتزام بالرسوم الفصلية (30 دينار تونسي لكل
                    دورة مدتها 3 أشهر).
                  </Text>
                </View>
              </Pressable>
            </FormField>

            {/* Submit CTA */}
            <Button
              label={
                isSubmitting ? 'جاري إرسال الطلب...' : 'إرسال طلب الانضمام'
              }
              onPress={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              testID="submit-application-button"
              className="mt-4"
            />

            {/* Back CTA */}
            <Button
              label="الرجوع لاختيار الحلقة"
              variant="outline"
              disabled={isSubmitting}
              onPress={handleBackToStep2}
              testID="step3-back-button"
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

              <Button
                label="التقديم على هذه الحلقة"
                onPress={handleProceedToStep3}
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
    </KeyboardAvoidingView>
  );
}
