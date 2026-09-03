import React, { useState } from 'react';
import { View, KeyboardAvoidingView, ScrollView } from 'react-native';
import { z } from 'zod';
import { FormField } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import { Banner } from '@/shared/components/Banner';
import { TopBar } from '@/shared/components/TopBar';
import { itemsStart } from '@/shared/theme/rtl';
import { TextInputField } from '@/features/auth/components/TextInputField';
import { AuthIntro } from '@/features/auth/components/AuthIntro';
import { OutcomeState } from '@/features/auth/components/OutcomeState';
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
  /** TopBar back control (the screen is entered from a deep link). */
  onBack?: () => void;
}

/** SCR-04 Reset password — Figma 21:220 (confirm) · 21:267 (expired token). */
export function ForgotPasswordConfirmScreen({
  token,
  onSuccess,
  onNavigateToRequest,
  onBack,
}: ForgotPasswordConfirmScreenProps) {
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isTokenInvalid, setIsTokenInvalid] = useState(
    !token || token.trim().length === 0,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="forgot-password-confirm-screen"
    >
      <TopBar
        title="كلمة مرور جديدة"
        onBack={onBack}
        testID="forgot-password-confirm-top-bar"
      />

      {isTokenInvalid ? (
        <OutcomeState
          icon="alert"
          tone="error"
          title="انتهت صلاحية الرابط"
          body="هذا الرابط لم يعد صالحًا. اطلب رابطًا جديدًا للمتابعة."
          testID="forgot-password-invalid-token-state"
        >
          {onNavigateToRequest ? (
            <Button
              label="طلب رابط جديد"
              onPress={onNavigateToRequest}
              className="w-full"
              testID="forgot-password-request-new-link-button"
            />
          ) : null}
        </OutcomeState>
      ) : (
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
            title="اختر كلمة مرور جديدة"
            subtitle="سيتم تسجيل خروجك من جميع الأجهزة بعد الحفظ."
          />

          {generalError ? (
            <Banner
              message={generalError}
              tone="error"
              testID="forgot-password-confirm-general-error"
            />
          ) : null}

          <View className={`w-full ${itemsStart}`}>
            <FormField
              label="كلمة المرور الجديدة"
              required
              helpText="8 أحرف على الأقل"
              error={errors.password}
              disabled={isSubmitting}
              testID="forgot-password-confirm-password-field"
              style={{ marginBottom: 0 }}
            >
              <TextInputField
                testID="forgot-password-confirm-password-input"
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
            label="حفظ كلمة المرور"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            testID="forgot-password-confirm-submit-button"
          />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
