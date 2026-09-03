import React, { useRef, useState } from 'react';
import {
  View,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { z } from 'zod';
import { FormField } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import { Banner } from '@/shared/components/Banner';
import { TopBar } from '@/shared/components/TopBar';
import { itemsStart } from '@/shared/theme/rtl';
import { TextInputField } from '@/features/auth/components/TextInputField';
import { AuthFooterLink } from '@/features/auth/components/AuthFooterLink';
import { AuthIntro } from '@/features/auth/components/AuthIntro';
import { registerUser } from '@/shared/api/auth.client';
import { ApiError } from '@/shared/api/types';
import { useAuthStore, storeRefreshToken } from '@/shared/auth/authStore';

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'البريد الإلكتروني مطلوب')
    .email('البريد الإلكتروني غير صالح'),
  password: z
    .string()
    .min(1, 'كلمة المرور مطلوبة')
    .min(8, 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل'),
});

export type RegisterFormData = z.infer<typeof registerSchema>;

export interface RegisterScreenProps {
  onNavigateToLogin?: () => void;
  onRegisterSuccess?: (role: string) => void;
}

/** SCR-02 Register — Figma 20:138. */
export function RegisterScreen({
  onNavigateToLogin,
  onRegisterSuccess,
}: RegisterScreenProps) {
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

    const validationResult = registerSchema.safeParse({ email, password });
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
      let timezone = 'Africa/Tunis';
      try {
        timezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Tunis';
      } catch {
        timezone = 'Africa/Tunis';
      }

      const response = await registerUser({
        email: email.trim().toLowerCase(),
        password,
        timezone,
      });

      if (response.refresh_token) {
        await storeRefreshToken(response.refresh_token);
      }

      useAuthStore.getState().setSession(response.access_token, response.role);
      onRegisterSuccess?.(response.role);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 409 || err.errorCode === 'EMAIL_TAKEN') {
          setErrors((prev) => ({
            ...prev,
            email: err.message || 'البريد الإلكتروني مستخدم بالفعل',
          }));
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
          setGeneralError(err.message || 'حدث خطأ أثناء إنشاء الحساب');
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
      testID="register-screen"
    >
      <TopBar
        title="إنشاء حساب"
        onBack={onNavigateToLogin}
        testID="register-top-bar"
      />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingBottom: 32,
          gap: 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <AuthIntro
          title="ابدأ من هنا"
          subtitle="البريد وكلمة المرور فقط — تُستكمل بياناتك عند طلب الانضمام لمجموعة."
        />

        {generalError ? (
          <Banner
            message={generalError}
            tone="error"
            testID="register-general-error"
          />
        ) : null}

        <View className={`w-full gap-5 ${itemsStart}`}>
          <FormField
            label="البريد الإلكتروني"
            required
            error={errors.email}
            disabled={isSubmitting}
            testID="register-email-field"
            style={{ marginBottom: 0 }}
          >
            <TextInputField
              testID="register-email-input"
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
            helpText="8 أحرف على الأقل"
            error={errors.password}
            disabled={isSubmitting}
            testID="register-password-field"
            style={{ marginBottom: 0 }}
          >
            <TextInputField
              ref={passwordInputRef}
              testID="register-password-input"
              secure
              placeholder="••••••••"
              textContentType="newPassword"
              autoComplete="new-password"
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
        </View>

        <Button
          label="إنشاء الحساب"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
          testID="register-submit-button"
        />

        {onNavigateToLogin ? (
          <AuthFooterLink
            prompt="لديك حساب بالفعل؟"
            linkLabel="تسجيل الدخول"
            onPress={onNavigateToLogin}
            disabled={isSubmitting}
            testID="register-login-link"
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
