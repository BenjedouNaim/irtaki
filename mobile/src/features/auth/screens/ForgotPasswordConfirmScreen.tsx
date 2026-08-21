import React, { useState } from 'react';
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
import { confirmPasswordReset } from '@/shared/api/auth.client';
import { ApiError } from '@/shared/api/types';

export const forgotPasswordConfirmSchema = z.object({
  password: z
    .string()
    .min(1, 'كلمة المرور مطلوبة')
    .min(8, 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل'),
});

export type ForgotPasswordConfirmFormData = z.infer<
  typeof forgotPasswordConfirmSchema
>;

export interface ForgotPasswordConfirmScreenProps {
  token?: string;
  onSuccess?: () => void;
  onNavigateToRequest?: () => void;
}

export function ForgotPasswordConfirmScreen({
  token,
  onSuccess,
  onNavigateToRequest,
}: ForgotPasswordConfirmScreenProps) {
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isTokenInvalid, setIsTokenInvalid] = useState(
    !token || token.trim().length === 0,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showPasswordLengthHint = Boolean(password) && password.length < 8;

  const handleSubmit = async () => {
    if (!token) {
      setIsTokenInvalid(true);
      return;
    }

    setGeneralError(null);

    const validationResult = forgotPasswordConfirmSchema.safeParse({
      password,
    });
    if (!validationResult.success) {
      const fieldErrors = validationResult.error.flatten().fieldErrors;
      setErrors({
        password: fieldErrors.password?.[0],
      });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await confirmPasswordReset({
        token,
        new_password: password,
      });

      // On success, no tokens are stored; route to login with success banner
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.statusCode === 400 ||
          err.errorCode === 'INVALID_OR_EXPIRED_TOKEN'
        ) {
          // UF.md §9: 400 INVALID_OR_EXPIRED_TOKEN → dead-end state with a "request a new one" CTA
          setIsTokenInvalid(true);
        } else if (err.statusCode === 422 && err.details) {
          const newErrors: { password?: string } = {};
          for (const detail of err.details) {
            if (
              detail.field === 'new_password' ||
              detail.field === 'password'
            ) {
              newErrors.password = detail.message;
            }
          }
          setErrors((prev) => ({ ...prev, ...newErrors }));
        } else {
          setGeneralError(
            err.message || 'حدث خطأ أثناء إعادة تعيين كلمة المرور',
          );
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
      testID="forgot-password-confirm-screen"
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
            تعيين كلمة مرور جديدة
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
            أدخل كلمة المرور الجديدة لحسابك
          </Text>
        </View>

        {generalError ? (
          <View
            className="bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-lg p-3 mb-4"
            style={{ borderCurve: 'continuous' }}
            testID="forgot-password-confirm-general-error"
          >
            <Text className="text-destructive-700 dark:text-destructive-300 text-sm text-center font-medium">
              {generalError}
            </Text>
          </View>
        ) : null}

        {isTokenInvalid ? (
          <View
            className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-5 mb-6"
            style={{ borderCurve: 'continuous' }}
            testID="forgot-password-invalid-token-state"
          >
            <Text className="text-amber-800 dark:text-amber-200 text-base font-semibold text-center mb-2">
              الرابط غير صالح أو منتهي الصلاحية
            </Text>
            <Text className="text-amber-700 dark:text-amber-300 text-sm text-center leading-relaxed mb-4">
              انتهت صلاحية هذا الرابط أو تم استخدامه مسبقاً. يرجى طلب رابط جديد
              لإعادة تعيين كلمة المرور.
            </Text>
            {onNavigateToRequest ? (
              <Button
                label="طلب رابط جديد"
                onPress={onNavigateToRequest}
                testID="forgot-password-request-new-link-button"
              />
            ) : null}
          </View>
        ) : (
          <View className="w-full">
            <FormField
              label="كلمة المرور الجديدة"
              required
              helpText={
                showPasswordLengthHint
                  ? 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل'
                  : undefined
              }
              error={errors.password}
              testID="forgot-password-confirm-password-field"
            >
              <TextInput
                testID="forgot-password-confirm-password-input"
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
              label="تعيين كلمة المرور"
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
              testID="forgot-password-confirm-submit-button"
              className="mt-2"
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
