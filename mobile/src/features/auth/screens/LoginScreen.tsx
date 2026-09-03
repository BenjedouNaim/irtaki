import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { z } from 'zod';
import { FormField } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import { Banner } from '@/shared/components/Banner';
import { Toast } from '@/shared/components/Toast';
import { typography } from '@/shared/theme/typography';
import { itemsStart } from '@/shared/theme/rtl';
import { TextInputField } from '@/features/auth/components/TextInputField';
import { AuthFooterLink } from '@/features/auth/components/AuthFooterLink';
import { loginUser } from '@/shared/api/auth.client';
import { ApiError } from '@/shared/api/types';
import { useAuthStore, storeRefreshToken } from '@/shared/auth/authStore';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'البريد الإلكتروني مطلوب')
    .email('البريد الإلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export interface LoginScreenProps {
  onNavigateToRegister?: () => void;
  onNavigateToForgotPassword?: () => void;
  onLoginSuccess?: (role: string) => void;
  successMessage?: string;
}

/** The 22px link + slop reaches the 48dp minimum (UF §32). */
const LINK_HIT_SLOP = { top: 13, bottom: 13, left: 8, right: 8 };

/** SCR-01 Login — Figma 20:2 (default) · 20:55 (401 banner) · 44:387 (dark). */
export function LoginScreen({
  onNavigateToRegister,
  onNavigateToForgotPassword,
  onLoginSuccess,
  successMessage,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordInputRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    setGeneralError(null);

    const validationResult = loginSchema.safeParse({ email, password });
    if (!validationResult.success) {
      const fieldErrors = validationResult.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const response = await loginUser({
        email: email.trim().toLowerCase(),
        password,
      });

      if (response.refresh_token) {
        await storeRefreshToken(response.refresh_token);
      }

      useAuthStore.getState().setSession(response.access_token, response.role);
      onLoginSuccess?.(response.role);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401 || err.errorCode === 'INVALID_CREDENTIALS') {
          // UF.md §9: 401 INVALID_CREDENTIALS — banner above form, password cleared & refocused
          setGeneralError(
            err.message || 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
          );
          setPassword('');
          setTimeout(() => {
            passwordInputRef.current?.focus();
          }, 50);
        } else if (err.statusCode === 422 && err.details) {
          const newErrors: { email?: string; password?: string } = {};
          for (const detail of err.details) {
            if (detail.field === 'email') {
              newErrors.email = detail.message;
            } else if (detail.field === 'password') {
              newErrors.password = detail.message;
            }
          }
          setErrors((prev) => ({ ...prev, ...newErrors }));
        } else {
          setGeneralError(err.message || 'حدث خطأ أثناء تسجيل الدخول');
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
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="login-screen"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 48,
          paddingHorizontal: 16,
          paddingBottom: 32,
          gap: 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View className={`w-full gap-1.5 ${itemsStart}`}>
          <Text
            accessibilityRole="header"
            className={`${typography.displayLg} text-right text-brand dark:text-brand-dark`}
          >
            ارتقِ
          </Text>
          <Text
            className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            سجّل الدخول لمتابعة رحلة الحفظ
          </Text>
        </View>

        {successMessage && !generalError ? (
          <Toast message={successMessage} testID="login-success-banner" />
        ) : null}

        {generalError ? (
          <Banner
            message={generalError}
            tone="error"
            icon="circle-x"
            testID="login-general-error"
          />
        ) : null}

        {/* Form */}
        <View className={`w-full gap-5 ${itemsStart}`}>
          <FormField
            label="البريد الإلكتروني"
            required
            error={errors.email}
            disabled={isSubmitting}
            testID="login-email-field"
            style={{ marginBottom: 0 }}
          >
            <TextInputField
              testID="login-email-input"
              ltr
              placeholder="name@example.com"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              error={Boolean(errors.email)}
              disabled={isSubmitting}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (errors.email) {
                  setErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
            />
          </FormField>

          <FormField
            label="كلمة المرور"
            required
            error={errors.password}
            disabled={isSubmitting}
            testID="login-password-field"
            style={{ marginBottom: 0 }}
          >
            <TextInputField
              ref={passwordInputRef}
              testID="login-password-input"
              secure
              placeholder="••••••••"
              textContentType="password"
              autoComplete="password"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              error={Boolean(errors.password)}
              disabled={isSubmitting}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
            />
          </FormField>

          {onNavigateToForgotPassword ? (
            <Pressable
              onPress={onNavigateToForgotPassword}
              disabled={isSubmitting}
              hitSlop={LINK_HIT_SLOP}
              accessibilityRole="link"
              accessibilityState={{ disabled: isSubmitting }}
              className="w-full active:opacity-70"
              testID="login-forgot-password-link"
            >
              <Text
                className={`w-full ${typography.labelMd} text-right text-brand dark:text-brand-dark`}
              >
                نسيت كلمة المرور؟
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Button
          label="تسجيل الدخول"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
          testID="login-submit-button"
        />

        {onNavigateToRegister ? (
          <AuthFooterLink
            prompt="ليس لديك حساب؟"
            linkLabel="إنشاء حساب"
            onPress={onNavigateToRegister}
            disabled={isSubmitting}
            testID="login-register-link"
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
