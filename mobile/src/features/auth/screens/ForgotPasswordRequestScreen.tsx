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
import { requestPasswordReset } from '@/shared/api/auth.client';
import { ApiError } from '@/shared/api/types';

export const forgotPasswordRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'البريد الإلكتروني مطلوب')
    .email('البريد الإلكتروني غير صالح'),
});

export type ForgotPasswordRequestFormData = z.infer<
  typeof forgotPasswordRequestSchema
>;

export interface ForgotPasswordRequestScreenProps {
  onNavigateToLogin?: () => void;
}

export function ForgotPasswordRequestScreen({
  onNavigateToLogin,
}: ForgotPasswordRequestScreenProps) {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ email?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setGeneralError(null);

    const validationResult = forgotPasswordRequestSchema.safeParse({ email });
    if (!validationResult.success) {
      const fieldErrors = validationResult.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
      });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await requestPasswordReset({
        email: email.trim().toLowerCase(),
      });

      // UF.md §9: Always show the same neutral confirmation regardless of account existence (EC-05)
      setIsSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 422 && err.details) {
          const newErrors: { email?: string } = {};
          for (const detail of err.details) {
            if (detail.field === 'email') {
              newErrors.email = detail.message;
            }
          }
          setErrors((prev) => ({ ...prev, ...newErrors }));
        } else {
          setGeneralError(err.message || 'حدث خطأ أثناء إرسال الطلب');
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
      testID="forgot-password-request-screen"
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
            استعادة كلمة المرور
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
            أدخل بريدك الإلكتروني لإرسال رابط إعادة تعيين كلمة المرور
          </Text>
        </View>

        {generalError ? (
          <View
            className="bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-lg p-3 mb-4"
            style={{ borderCurve: 'continuous' }}
            testID="forgot-password-general-error"
          >
            <Text className="text-destructive-700 dark:text-destructive-300 text-sm text-center font-medium">
              {generalError}
            </Text>
          </View>
        ) : null}

        {isSubmitted ? (
          <View
            className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 mb-6"
            style={{ borderCurve: 'continuous' }}
            testID="forgot-password-success-banner"
          >
            <Text className="text-emerald-800 dark:text-emerald-200 text-base font-semibold text-center mb-2">
              تم إرسال التعليمات
            </Text>
            <Text className="text-emerald-700 dark:text-emerald-300 text-sm text-center leading-relaxed mb-4">
              إذا كان البريد الإلكتروني مسجلاً في النظام، فقد تم إرسال رابط
              إعادة تعيين كلمة المرور إليه. يرجى التحقق من صندوق الوارد.
            </Text>
            {onNavigateToLogin ? (
              <Button
                label="العودة لتسجيل الدخول"
                variant="outline"
                onPress={onNavigateToLogin}
                testID="forgot-password-back-to-login-button"
              />
            ) : null}
          </View>
        ) : (
          <View className="w-full">
            <FormField
              label="البريد الإلكتروني"
              required
              error={errors.email}
              testID="forgot-password-email-field"
            >
              <TextInput
                testID="forgot-password-email-input"
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

            <Button
              label="إرسال رابط إعادة التعيين"
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
              testID="forgot-password-submit-button"
              className="mt-2"
            />
          </View>
        )}

        {onNavigateToLogin && !isSubmitted ? (
          <View className="flex-row-reverse justify-center items-center mt-6">
            <Pressable
              onPress={onNavigateToLogin}
              disabled={isSubmitting}
              testID="forgot-password-back-link"
            >
              <Text className="text-sm font-bold text-primary dark:text-primary-400">
                العودة إلى تسجيل الدخول
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
