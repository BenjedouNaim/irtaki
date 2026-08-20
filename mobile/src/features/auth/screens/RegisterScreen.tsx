import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardContainer}
      testID="register-screen"
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.appName}>إرتقِ</Text>
          <Text style={styles.title}>إنشاء حساب جديد</Text>
          <Text style={styles.subtitle}>
            أدخل بريدك الإلكتروني وكلمة المرور للبدء
          </Text>
        </View>

        {generalError ? (
          <View
            style={styles.generalErrorBanner}
            testID="register-general-error"
          >
            <Text style={styles.generalErrorText}>{generalError}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <FormField
            label="البريد الإلكتروني"
            required
            error={errors.email}
            testID="register-email-field"
          >
            <TextInput
              testID="register-email-input"
              style={[styles.input, Boolean(errors.email) && styles.inputError]}
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
              style={[
                styles.input,
                Boolean(errors.password) && styles.inputError,
              ]}
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
            style={styles.submitButton}
          />
        </View>

        {onNavigateToLogin ? (
          <View style={styles.footer}>
            <Text style={styles.footerText}>لديك حساب بالفعل؟ </Text>
            <TouchableOpacity
              onPress={onNavigateToLogin}
              disabled={isSubmitting}
              testID="register-login-link"
            >
              <Text style={styles.loginLinkText}>تسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f766e',
    marginBottom: 8,
    fontFamily: Platform.select({
      ios: 'NotoNaskhArabic-Bold',
      default: 'sans-serif',
    }),
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  generalErrorBanner: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  generalErrorText: {
    color: '#dc2626',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  form: {
    width: '100%',
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  inputError: {
    borderColor: '#dc2626',
    backgroundColor: '#fff',
  },
  submitButton: {
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
  },
  loginLinkText: {
    fontSize: 14,
    color: '#0f766e',
    fontWeight: '700',
  },
});
