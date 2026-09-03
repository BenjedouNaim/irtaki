import React, { useEffect, useState } from 'react';
import { View, Text, KeyboardAvoidingView, ScrollView } from 'react-native';
import { z } from 'zod';
import { FormField } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import { Banner } from '@/shared/components/Banner';
import { Toast } from '@/shared/components/Toast';
import { TopBar } from '@/shared/components/TopBar';
import { Icon } from '@/shared/components/Icon';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { TextInputField } from '@/features/auth/components/TextInputField';
import { getMe, updateProfile, MeResponse } from '@/shared/api/me.client';
import { logoutUser } from '@/shared/api/auth.client';
import { ApiError } from '@/shared/api/types';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';

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

const NOT_SET_YET = 'غير محدد بعد';

interface InfoRowProps {
  label: string;
  value: string;
  /** Latin values (email) are LTR-embedded at the left of the row. */
  ltr?: boolean;
  testID: string;
}

/** Figma 43:81 — 44px label (right, body/md secondary) + value (left, body/md-medium). */
function InfoRow({ label, value, ltr = false, testID }: InfoRowProps) {
  return (
    <View
      className={`w-full ${rowStart} items-center justify-between min-h-[44px] gap-3`}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text
        className={`flex-1 ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        maxFontSizeMultiplier={1.6}
      >
        {label}
      </Text>
      <Text
        testID={testID}
        className={`${typography.bodyMdMedium} text-fg dark:text-fg-dark ${
          ltr ? 'text-left' : 'text-right'
        }`}
        numberOfLines={1}
        maxFontSizeMultiplier={1.6}
      >
        {value}
      </Text>
    </View>
  );
}

/** SCR-34 Profile / Account — Figma 43:42. */
export function ProfileScreen() {
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [timezone, setTimezone] = useState('');
  const [errors, setErrors] = useState<{ timezone?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  // UF §9 Logout: single tap, no confirmation, fire-and-forget; clearing the
  // session lets the authenticated layout bounce to Login.
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const refreshToken = await getStoredRefreshToken();
      if (refreshToken) {
        await logoutUser(refreshToken);
      }
    } catch {
      // Best effort logout on API failure
    } finally {
      await deleteStoredRefreshToken();
      useAuthStore.getState().clearSession();
      setIsLoggingOut(false);
    }
  };

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-canvas dark:bg-canvas-dark"
        testID="profile-loading-skeleton"
      >
        <TopBar title="الحساب" testID="profile-top-bar" />
        <View className="px-4 pt-1">
          <SkeletonLoader variant="row" count={3} />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View
        className="flex-1 bg-canvas dark:bg-canvas-dark"
        testID="profile-load-error-container"
      >
        <TopBar title="الحساب" testID="profile-top-bar" />
        <View className="px-4 pt-1">
          <Banner
            message={loadError}
            tone="error"
            onRetry={() => void fetchProfile()}
            testID="profile-load-error-banner"
          />
        </View>
      </View>
    );
  }

  const roleLabel = profile ? ROLE_LABELS[profile.role] || profile.role : '';
  const fullNameDisplay = profile?.full_name?.trim() || NOT_SET_YET;
  const initial = profile?.full_name?.trim().charAt(0) ?? '';
  const genderDisplay =
    profile?.gender === 'Male'
      ? 'ذكر'
      : profile?.gender === 'Female'
        ? 'أنثى'
        : NOT_SET_YET;

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="profile-screen"
    >
      <TopBar title="الحساب" testID="profile-top-bar" />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 4,
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header — avatar initial, name, role badge */}
        <View className="w-full items-center py-2 gap-2.5">
          <View
            testID="profile-avatar"
            className="w-[72px] h-[72px] rounded-full bg-primary-subtle dark:bg-primary-subtle-dark items-center justify-center"
            accessibilityLabel={fullNameDisplay}
          >
            {initial ? (
              <Text
                className={`${typography.headingXl} text-center text-brand dark:text-brand-dark`}
                maxFontSizeMultiplier={1.2}
              >
                {initial}
              </Text>
            ) : (
              <Icon name="user" size={30} tone="brand" />
            )}
          </View>
          <Text
            testID="profile-fullname-display"
            accessibilityRole="header"
            className={`${typography.headingLg} text-center ${
              profile?.full_name
                ? 'text-fg dark:text-fg-dark'
                : 'text-fg-secondary dark:text-fg-secondary-dark'
            }`}
          >
            {fullNameDisplay}
          </Text>
          <StatusBadge
            status={roleLabel}
            variant="success"
            className="self-center"
            testID="profile-role-display"
          />
        </View>

        {generalError ? (
          <Banner
            message={generalError}
            tone="error"
            testID="profile-general-error"
          />
        ) : null}

        {submitSuccess ? (
          <Toast
            message="تم تحديث الملف الشخصي بنجاح"
            onDismiss={() => setSubmitSuccess(false)}
            testID="profile-success-banner"
          />
        ) : null}

        {/* Info card — read-only account data */}
        <View
          className={`w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-4 py-2.5 gap-1 ${itemsStart}`}
          style={{ borderCurve: 'continuous' }}
          testID="profile-info-card"
        >
          <InfoRow
            label="البريد الإلكتروني"
            value={profile?.email || ''}
            ltr
            testID="profile-email-display"
          />
          <InfoRow
            label="الجنس"
            value={genderDisplay}
            testID="profile-gender-display"
          />
        </View>

        <Text
          className={`w-full ${typography.caption} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
        >
          الاسم والجنس والدور تُحدَّد عبر الانضمام والإدارة فقط — لا تُعدَّل
          هنا.
        </Text>

        {/* Timezone — the only editable field (UF SCR-34) */}
        <View className={`w-full pt-1.5 gap-4 ${itemsStart}`}>
          <FormField
            label="المنطقة الزمنية"
            required
            error={errors.timezone}
            disabled={isSubmitting}
            helpText="معرّف المنطقة الزمنية القياسي (مثل Africa/Tunis أو Europe/Paris)"
            testID="profile-timezone-field"
            style={{ marginBottom: 0 }}
          >
            <TextInputField
              testID="profile-timezone-input"
              ltr
              placeholder="Africa/Tunis"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              error={Boolean(errors.timezone)}
              disabled={isSubmitting}
              value={timezone}
              onChangeText={(text) => {
                setTimezone(text);
                if (errors.timezone) {
                  setErrors((prev) => ({ ...prev, timezone: undefined }));
                }
              }}
            />
          </FormField>

          <Button
            label="حفظ التغييرات"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            testID="profile-submit-button"
          />
        </View>

        <View className="flex-1" />

        <Button
          label="تسجيل الخروج"
          variant="ghost"
          textClassName="text-fg-error"
          onPress={handleLogout}
          loading={isLoggingOut}
          disabled={isLoggingOut || isSubmitting}
          accessibilityLabel="تسجيل الخروج"
          testID="profile-logout-button"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
