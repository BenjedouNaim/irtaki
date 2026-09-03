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

/** SCR-03 Forgot Password — Figma 21:134 (request) · 21:182 (sent, neutral). */
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
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="forgot-password-request-screen"
    >
      <TopBar
        title="استعادة كلمة المرور"
        onBack={onNavigateToLogin}
        testID="forgot-password-top-bar"
      />

      {isSubmitted ? (
        <OutcomeState
          icon="mail"
          tone="brand"
          title="تحقّق من بريدك"
          body="إن كان هذا البريد مسجّلًا لدينا، فستصلك رسالة تحتوي رابط إعادة التعيين خلال دقائق."
          testID="forgot-password-success-banner"
        >
          {onNavigateToLogin ? (
            <Button
              label="العودة لتسجيل الدخول"
              variant="ghost"
              onPress={onNavigateToLogin}
              className="w-full"
              testID="forgot-password-back-to-login-button"
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
            title="أدخل بريدك الإلكتروني"
            subtitle="سنرسل رابط إعادة التعيين إن كان الحساب موجودًا."
          />

          {generalError ? (
            <Banner
              message={generalError}
              tone="error"
              testID="forgot-password-general-error"
            />
          ) : null}

          <View className={`w-full ${itemsStart}`}>
            <FormField
              label="البريد الإلكتروني"
              required
              error={errors.email}
              disabled={isSubmitting}
              testID="forgot-password-email-field"
              style={{ marginBottom: 0 }}
            >
              <TextInputField
                testID="forgot-password-email-input"
                ltr
                placeholder="name@example.com"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={handleSubmit}
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
          </View>

          <Button
            label="إرسال الرابط"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            testID="forgot-password-submit-button"
          />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
