import React, { useState } from 'react';
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
}

export function RegisterScreen({ onNavigateToLogin }: RegisterScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showPasswordLengthHint = Boolean(password) && password.length < 8;

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
      className="flex-1 bg-white dark:bg-gray-950"
      testID="register-screen"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
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
            إنشاء حساب جديد
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
            أدخل بريدك الإلكتروني وكلمة المرور للبدء
          </Text>
        </View>

        {generalError ? (
          <View
            className="bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-lg p-3 mb-4"
            style={{ borderCurve: 'continuous' }}
            testID="register-general-error"
          >
            <Text className="text-destructive-700 dark:text-destructive-300 text-sm text-center font-medium">
              {generalError}
            </Text>
          </View>
        ) : null}

        <View className="w-full">
          <FormField
            label="البريد الإلكتروني"
            required
            error={errors.email}
            testID="register-email-field"
          >
            <TextInput
              testID="register-email-input"
              className={`w-full h-12 border rounded-lg px-3.5 text-base text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 text-right ${
                errors.email
                  ? 'border-destructive bg-white dark:bg-gray-950'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              style={{ borderCurve: 'continuous' }}
              placeholder="example@domain.com"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (errors.email) {
                  setErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              textAlign="right"
            />
          </FormField>

          <FormField
            label="كلمة المرور"
            required
            helpText={
              showPasswordLengthHint
                ? 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل'
                : undefined
            }
            error={errors.password}
            testID="register-password-field"
          >
            <TextInput
              testID="register-password-input"
              className={`w-full h-12 border rounded-lg px-3.5 text-base text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 text-right ${
                errors.password
                  ? 'border-destructive bg-white dark:bg-gray-950'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              style={{ borderCurve: 'continuous' }}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              textAlign="right"
            />
          </FormField>

          <Button
            label="إنشاء الحساب"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            testID="register-submit-button"
            className="mt-2"
          />
        </View>

        {onNavigateToLogin ? (
          <View className="flex-row-reverse justify-center items-center mt-6">
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              لديك حساب بالفعل؟{' '}
            </Text>
            <Pressable
              onPress={onNavigateToLogin}
              disabled={isSubmitting}
              testID="register-login-link"
            >
              <Text className="text-sm font-bold text-primary dark:text-primary-400">
                تسجيل الدخول
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
