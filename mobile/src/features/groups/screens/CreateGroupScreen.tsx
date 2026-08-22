import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { z } from 'zod';
import { FormField } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { createGroup, listUsersByRole, UserListItem } from '@/shared/api';
import { ApiError } from '@/shared/api/types';
import { RECITATION_DAYS_MAP } from './JoinStepperScreen';

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'اسم الحلقة مطلوب'),
  gender: z
    .string()
    .min(1, 'يرجى تحديد الفئة المستهدفة')
    .refine((v): v is 'Male' | 'Female' => v === 'Male' || v === 'Female', {
      message: 'يرجى تحديد الفئة المستهدفة',
    }),
  recitation_day: z
    .number({ message: 'يرجى تحديد يوم التسميع' })
    .int('يوم التسميع غير صالح')
    .min(1, 'يوم التسميع غير صالح')
    .max(7, 'يوم التسميع غير صالح'),
  teacher_id: z.string().min(1, 'يرجى اختيار المعلم المشرف'),
  assistant_id: z.string().min(1, 'يرجى اختيار المساعد الإداري'),
});

export type CreateGroupFormData = z.infer<typeof createGroupSchema>;

export interface CreateGroupScreenProps {
  onSuccess?: (groupId: string) => void;
}

export function CreateGroupScreen({ onSuccess }: CreateGroupScreenProps) {
  const router = useRouter();

  // Form state
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | null>(null);
  const [recitationDay, setRecitationDay] = useState<number | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState<string | null>(null);

  // Staff options state
  const [teachers, setTeachers] = useState<UserListItem[]>([]);
  const [assistants, setAssistants] = useState<UserListItem[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Validation & submission state
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStaff = useCallback(async () => {
    setIsLoadingStaff(true);
    setStaffError(null);
    try {
      const [teachersRes, assistantsRes] = await Promise.all([
        listUsersByRole('Teacher'),
        listUsersByRole('Assistant'),
      ]);
      setTeachers(teachersRes.data);
      setAssistants(assistantsRes.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setStaffError(err.message || 'تعذر تحميل قائمة الكادر الإداري والتعليمي');
      } else {
        setStaffError('تعذر الاتصال بالخادم لتحميل قائمة المعلمين والمساعدين.');
      }
    } finally {
      setIsLoadingStaff(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const triggerHaptic = () => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.selectionAsync();
      } catch {
        // Ignored
      }
    }
  };

  const handleGenderSelect = (selected: 'Male' | 'Female') => {
    triggerHaptic();
    setGender(selected);
    if (errors.gender) {
      setErrors((prev) => ({ ...prev, gender: undefined }));
    }
  };

  const handleDaySelect = (day: number) => {
    triggerHaptic();
    setRecitationDay(day);
    if (errors.recitation_day) {
      setErrors((prev) => ({ ...prev, recitation_day: undefined }));
    }
  };

  const handleTeacherSelect = (id: string) => {
    triggerHaptic();
    setTeacherId(id);
    if (errors.teacher_id) {
      setErrors((prev) => ({ ...prev, teacher_id: undefined }));
    }
  };

  const handleAssistantSelect = (id: string) => {
    triggerHaptic();
    setAssistantId(id);
    if (errors.assistant_id) {
      setErrors((prev) => ({ ...prev, assistant_id: undefined }));
    }
  };

  const handleSubmit = async () => {
    setGeneralError(null);

    const validationResult = createGroupSchema.safeParse({
      name,
      gender: gender || '',
      recitation_day: recitationDay ?? undefined,
      teacher_id: teacherId || '',
      assistant_id: assistantId || '',
    });


    if (!validationResult.success) {
      const fieldErrors = validationResult.error.flatten().fieldErrors;
      setErrors({
        name: fieldErrors.name?.[0],
        gender: fieldErrors.gender?.[0],
        recitation_day: fieldErrors.recitation_day?.[0],
        teacher_id: fieldErrors.teacher_id?.[0],
        assistant_id: fieldErrors.assistant_id?.[0],
      });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const response = await createGroup({
        name: name.trim(),
        gender: gender!,
        recitation_day: recitationDay!,
        teacher_id: teacherId!,
        assistant_id: assistantId!,
      });

      const newGroupId = response.data.id;
      if (onSuccess) {
        onSuccess(newGroupId);
      } else {
        router.replace({
          pathname: '/admin/groups/[id]',
          params: { id: newGroupId },
        });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 409 || err.errorCode === 'GROUP_NAME_TAKEN') {
          // 409 is a business rule / state conflict -> render as top banner (UF.md §21)
          setGeneralError(err.message || 'اسم الحلقة مستخدم بالفعل');
        } else if (err.statusCode === 422 && err.details) {
          const newErrors: Record<string, string> = {};
          for (const detail of err.details) {
            if (detail.field) {
              newErrors[detail.field] = detail.message;
            }
          }
          setErrors(newErrors);
        } else {
          setGeneralError(err.message || 'حدث خطأ أثناء إنشاء الحلقة');
        }
      } else {
        setGeneralError('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-gray-50 dark:bg-gray-950"
      testID="create-group-screen"
    >
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 20,
          paddingBottom: 48,
        }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Header Title */}
        <View className="mb-2">
          <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right mb-1">
            إنشاء حلقة جديدة
          </Text>
          <Text className="text-sm text-gray-600 dark:text-gray-400 text-right">
            أدخل تفاصيل الحلقة القرآنية وقم بتعيين المعلم والمساعد المشرفين
          </Text>
        </View>

        {/* General Error Banner (409 Conflict / Network) */}
        {generalError ? (
          <View
            className="p-4 rounded-xl bg-destructive-50 border border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800"
            style={{ borderCurve: 'continuous' }}
            testID="create-group-general-error"
          >
            <Text
              selectable
              className="text-sm font-medium text-destructive-700 dark:text-destructive-300 text-right leading-5"
            >
              {generalError}
            </Text>
          </View>
        ) : null}

        {/* Form Container */}
        <View
          className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 gap-5"
          style={{ borderCurve: 'continuous' }}
        >
          {/* 1. Group Name */}
          <FormField
            label="اسم الحلقة"
            required
            error={errors.name}
            testID="group-name-field"
          >
            <TextInput
              testID="group-name-input"
              className={`w-full h-12 border rounded-lg px-3.5 text-base text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 text-right ${
                errors.name
                  ? 'border-destructive bg-white dark:bg-gray-950'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              style={{ borderCurve: 'continuous' }}
              placeholder="مثال: حلقة الإمام نافع"
              placeholderTextColor="#9ca3af"
              editable={!isSubmitting}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (errors.name) {
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
              textAlign="right"
            />
          </FormField>

          {/* 2. Target Gender */}
          <FormField
            label="الفئة المستهدفة"
            required
            error={errors.gender}
            testID="group-gender-field"
          >
            <View className="flex-row gap-3">
              <Pressable
                testID="gender-male-option"
                accessibilityRole="radio"
                accessibilityState={{ selected: gender === 'Male' }}
                accessibilityLabel="ذكور (بنين)"
                onPress={() => handleGenderSelect('Male')}
                disabled={isSubmitting}
                className={`flex-1 p-3.5 rounded-xl border-2 items-center justify-center ${
                  gender === 'Male'
                    ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                    : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900'
                }`}
                style={{ borderCurve: 'continuous' }}
              >
                <Text
                  className={`text-sm font-bold ${
                    gender === 'Male'
                      ? 'text-primary dark:text-primary-400'
                      : 'text-gray-800 dark:text-gray-200'
                  }`}
                >
                  ذكور (بنين)
                </Text>
              </Pressable>

              <Pressable
                testID="gender-female-option"
                accessibilityRole="radio"
                accessibilityState={{ selected: gender === 'Female' }}
                accessibilityLabel="إناث (بنات)"
                onPress={() => handleGenderSelect('Female')}
                disabled={isSubmitting}
                className={`flex-1 p-3.5 rounded-xl border-2 items-center justify-center ${
                  gender === 'Female'
                    ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                    : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900'
                }`}
                style={{ borderCurve: 'continuous' }}
              >
                <Text
                  className={`text-sm font-bold ${
                    gender === 'Female'
                      ? 'text-primary dark:text-primary-400'
                      : 'text-gray-800 dark:text-gray-200'
                  }`}
                >
                  إناث (بنات)
                </Text>
              </Pressable>
            </View>
          </FormField>

          {/* 3. Recitation Day */}
          <FormField
            label="يوم التسميع الأسبوعي"
            required
            error={errors.recitation_day}
            testID="group-recitation-day-field"
          >
            <View className="flex-row flex-wrap gap-2 justify-end">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                const isSelected = recitationDay === day;
                return (
                  <Pressable
                    key={day}
                    testID={`recitation-day-option-${day}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={RECITATION_DAYS_MAP[day]}
                    onPress={() => handleDaySelect(day)}
                    disabled={isSubmitting}
                    className={`px-3 py-2.5 rounded-lg border min-w-[70px] items-center justify-center ${
                      isSelected
                        ? 'border-primary bg-primary-50/50 dark:bg-primary-950/50'
                        : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900'
                    }`}
                    style={{ borderCurve: 'continuous' }}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        isSelected
                          ? 'text-primary dark:text-primary-400'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {RECITATION_DAYS_MAP[day]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </FormField>

          {/* 4. Staff Assignment Wrapper */}
          <View className="border-t border-gray-100 dark:border-gray-800 pt-4 gap-4">
            <Text className="text-base font-bold text-gray-900 dark:text-gray-100 text-right">
              تعيين الكادر المشرف
            </Text>

            {isLoadingStaff ? (
              <View testID="staff-loading-skeleton" className="gap-3">
                <SkeletonLoader count={2} variant="row" />
              </View>
            ) : staffError ? (
              <View
                className="p-3 rounded-lg bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 gap-2"
                style={{ borderCurve: 'continuous' }}
              >
                <Text className="text-xs text-destructive-700 dark:text-destructive-300 text-right">
                  {staffError}
                </Text>
                <Button
                  label="إعادة المحاولة"
                  variant="outline"
                  onPress={fetchStaff}
                  testID="retry-staff-button"
                />
              </View>
            ) : (
              <>
                {/* Teacher Selection */}
                <FormField
                  label="المعلم المشرف"
                  required
                  error={errors.teacher_id}
                  testID="teacher-select-field"
                >
                  {teachers.length === 0 ? (
                    <Text className="text-xs text-gray-500 dark:text-gray-400 text-right py-2">
                      لا يوجد معلمون مسجلون حالياً
                    </Text>
                  ) : (
                    <View className="gap-2">
                      {teachers.map((t) => {
                        const isSelected = teacherId === t.id;
                        return (
                          <Pressable
                            key={t.id}
                            testID={`teacher-option-${t.id}`}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                            accessibilityLabel={t.full_name || t.email}
                            onPress={() => handleTeacherSelect(t.id)}
                            disabled={isSubmitting}
                            className={`p-3 rounded-xl border flex-row-reverse items-center justify-between ${
                              isSelected
                                ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                                : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900'
                            }`}
                            style={{ borderCurve: 'continuous' }}
                          >
                            <Text
                              className={`text-sm font-semibold text-right ${
                                isSelected
                                  ? 'text-primary dark:text-primary-400'
                                  : 'text-gray-900 dark:text-gray-100'
                              }`}
                            >
                              {t.full_name || t.email}
                            </Text>
                            {isSelected && (
                              <View className="w-2.5 h-2.5 rounded-full bg-primary" />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </FormField>

                {/* Assistant Selection */}
                <FormField
                  label="المساعد الإداري"
                  required
                  error={errors.assistant_id}
                  testID="assistant-select-field"
                >
                  {assistants.length === 0 ? (
                    <Text className="text-xs text-gray-500 dark:text-gray-400 text-right py-2">
                      لا يوجد مساعدون إداريون مسجلون حالياً
                    </Text>
                  ) : (
                    <View className="gap-2">
                      {assistants.map((a) => {
                        const isSelected = assistantId === a.id;
                        return (
                          <Pressable
                            key={a.id}
                            testID={`assistant-option-${a.id}`}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                            accessibilityLabel={a.full_name || a.email}
                            onPress={() => handleAssistantSelect(a.id)}
                            disabled={isSubmitting}
                            className={`p-3 rounded-xl border flex-row-reverse items-center justify-between ${
                              isSelected
                                ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                                : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900'
                            }`}
                            style={{ borderCurve: 'continuous' }}
                          >
                            <Text
                              className={`text-sm font-semibold text-right ${
                                isSelected
                                  ? 'text-primary dark:text-primary-400'
                                  : 'text-gray-900 dark:text-gray-100'
                              }`}
                            >
                              {a.full_name || a.email}
                            </Text>
                            {isSelected && (
                              <View className="w-2.5 h-2.5 rounded-full bg-primary" />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </FormField>
              </>
            )}
          </View>
        </View>

        {/* Submit Button */}
        <Button
          label="إنشاء الحلقة"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
          testID="create-group-submit-button"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
