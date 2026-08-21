import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { z } from 'zod';
import { FormField } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { getMe, updateProfile, MeResponse } from '@/shared/api/me.client';
import { ApiError } from '@/shared/api/types';

export const updateProfileSchema = z.object({
  timezone: z.string().trim().min(1, 'المنطقة الزمنية مطلوبة'),
});

export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

const ROLE_LABELS: Record<string, string> = {
  Admin: 'مدير النظام',
  Teacher: 'معلم',
  Assistant: 'مساعد',
  Student: 'طالب',
  User: 'مستخدم جديد',
};

export function ProfileScreen() {
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [timezone, setTimezone] = useState('');
  const [errors, setErrors] = useState<{ timezone?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProfile = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getMe();
      setProfile(data);
      setTimezone(data.timezone || '');
    } catch (err) {
      if (err instanceof ApiError) {
        setLoadError(err.message || 'تعذر تحميل بيانات الملف الشخصي');
      } else {
        setLoadError(
          'تعذر الاتصال بالخادم. يرجى التحقق من الاتصال بالإنترنت والمحاولة مجدداً.',
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchProfile();
  }, []);

  const handleSubmit = async () => {
    setGeneralError(null);
    setSubmitSuccess(false);

    const validationResult = updateProfileSchema.safeParse({ timezone });
    if (!validationResult.success) {
      const fieldErrors = validationResult.error.flatten().fieldErrors;
      setErrors({
        timezone: fieldErrors.timezone?.[0],
      });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const updated = await updateProfile({
        timezone: timezone.trim(),
      });
      setProfile(updated);
      setTimezone(updated.timezone);
      setSubmitSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 422) {
          if (err.details && err.details.length > 0) {
            const newErrors: { timezone?: string } = {};
            for (const detail of err.details) {
              if (detail.field === 'timezone') {
                newErrors.timezone = detail.message;
              }
            }
            setErrors((prev) => ({ ...prev, ...newErrors }));
          } else {
            setErrors((prev) => ({
              ...prev,
              timezone: err.message || 'المنطقة الزمنية غير صالحة',
            }));
          }
        } else {
          setGeneralError(err.message || 'حدث خطأ أثناء تحديث الملف الشخصي');
        }
      } else {
        setGeneralError('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-white dark:bg-gray-950 p-6 justify-center"
        testID="profile-loading-skeleton"
      >
        <SkeletonLoader variant="row" count={4} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View
        className="flex-1 bg-white dark:bg-gray-950 p-6 justify-center items-center"
        testID="profile-load-error-container"
      >
        <View
          className="w-full bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-xl p-5 mb-6"
          style={{ borderCurve: 'continuous' }}
          testID="profile-load-error-banner"
        >
          <Text className="text-destructive-800 dark:text-destructive-200 text-base font-semibold text-center mb-2">
            خطأ في تحميل البيانات
          </Text>
          <Text className="text-destructive-700 dark:text-destructive-300 text-sm text-center leading-relaxed mb-4">
            {loadError}
          </Text>
          <Button
            label="إعادة المحاولة"
            variant="outline"
            onPress={() => void fetchProfile()}
            testID="profile-retry-button"
          />
        </View>
      </View>
    );
  }

  const roleLabel = profile ? ROLE_LABELS[profile.role] || profile.role : '';
  const fullNameDisplay = profile?.full_name || 'غير محدد بعد';
  const genderDisplay =
    profile?.gender === 'Male'
      ? 'ذكر'
      : profile?.gender === 'Female'
        ? 'أنثى'
        : 'غير محدد بعد';

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white dark:bg-gray-950"
      testID="profile-screen"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingVertical: 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-8">
          <Text className="text-3xl font-extrabold text-primary dark:text-primary-400 mb-2 font-arabic-bold">
            إرتقِ
          </Text>
          <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1.5 text-center">
            الملف الشخصي
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
            عرض وتحديث معلومات الحساب والمنطقة الزمنية
          </Text>
        </View>

        {generalError ? (
          <View
            className="bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-lg p-3 mb-4"
            style={{ borderCurve: 'continuous' }}
            testID="profile-general-error"
          >
            <Text className="text-destructive-700 dark:text-destructive-300 text-sm text-center font-medium">
              {generalError}
            </Text>
          </View>
        ) : null}

        {submitSuccess ? (
          <View
            className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-4"
            style={{ borderCurve: 'continuous' }}
            testID="profile-success-banner"
          >
            <Text className="text-emerald-800 dark:text-emerald-200 text-sm font-semibold text-center">
              تم تحديث الملف الشخصي بنجاح
            </Text>
          </View>
        ) : null}

        <View className="w-full">
          {/* Read-Only: Email */}
          <FormField label="البريد الإلكتروني" testID="profile-email-field">
            <TextInput
              testID="profile-email-display"
              className="w-full h-12 border border-gray-200 dark:border-gray-800 rounded-lg px-3.5 text-base text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 text-right"
              style={{ borderCurve: 'continuous' }}
              value={profile?.email || ''}
              editable={false}
              textAlign="right"
            />
          </FormField>

          {/* Read-Only: Full Name */}
          <FormField label="الاسم الكامل" testID="profile-fullname-field">
            <TextInput
              testID="profile-fullname-display"
              className="w-full h-12 border border-gray-200 dark:border-gray-800 rounded-lg px-3.5 text-base text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 text-right"
              style={{ borderCurve: 'continuous' }}
              value={fullNameDisplay}
              editable={false}
              textAlign="right"
            />
          </FormField>

          {/* Read-Only: Gender */}
          <FormField label="الجنس" testID="profile-gender-field">
            <TextInput
              testID="profile-gender-display"
              className="w-full h-12 border border-gray-200 dark:border-gray-800 rounded-lg px-3.5 text-base text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 text-right"
              style={{ borderCurve: 'continuous' }}
              value={genderDisplay}
              editable={false}
              textAlign="right"
            />
          </FormField>

          {/* Read-Only: Role */}
          <FormField label="الدور / الصلاحية" testID="profile-role-field">
            <TextInput
              testID="profile-role-display"
              className="w-full h-12 border border-gray-200 dark:border-gray-800 rounded-lg px-3.5 text-base text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900 text-right font-medium"
              style={{ borderCurve: 'continuous' }}
              value={roleLabel}
              editable={false}
              textAlign="right"
            />
          </FormField>

          {/* Editable: Timezone */}
          <FormField
            label="المنطقة الزمنية"
            required
            error={errors.timezone}
            helpText="معرّف المنطقة الزمنية القياسي (مثل Africa/Tunis أو Europe/Paris)"
            testID="profile-timezone-field"
          >
            <TextInput
              testID="profile-timezone-input"
              className={`w-full h-12 border rounded-lg px-3.5 text-base text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 text-right ${
                errors.timezone
                  ? 'border-destructive bg-white dark:bg-gray-950'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              style={{ borderCurve: 'continuous' }}
              placeholder="Africa/Tunis"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              value={timezone}
              onChangeText={(text) => {
                setTimezone(text);
                if (errors.timezone) {
                  setErrors((prev) => ({ ...prev, timezone: undefined }));
                }
              }}
              textAlign="right"
            />
          </FormField>

          <Button
            label="حفظ التغييرات"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            testID="profile-submit-button"
            className="mt-4"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
