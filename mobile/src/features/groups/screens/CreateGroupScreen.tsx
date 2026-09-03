import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { z } from 'zod';
import {
  TopBar,
  FormField,
  Button,
  Banner,
  Icon,
  SegmentedControl,
  SkeletonLoader,
  getInputClassName,
} from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { useThemeColors } from '@/shared/theme/colors';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { createGroup, listUsersByRole, UserListItem } from '@/shared/api';
import { ApiError } from '@/shared/api/types';
import { RECITATION_DAYS_MAP } from '@/features/joinRequests/screens/JoinStepperScreen';
import { StaffPickerSheet } from '../components/StaffPickerSheet';

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'اسم المجموعة مطلوب'),
  gender: z
    .string()
    .min(1, 'يرجى تحديد الجنس')
    .refine((v): v is 'Male' | 'Female' => v === 'Male' || v === 'Female', {
      message: 'يرجى تحديد الجنس',
    }),
  recitation_day: z
    .number({ message: 'يرجى تحديد يوم التسميع' })
    .int('يوم التسميع غير صالح')
    .min(1, 'يوم التسميع غير صالح')
    .max(7, 'يوم التسميع غير صالح'),
  teacher_id: z.string().min(1, 'يرجى اختيار المعلّم'),
  assistant_id: z.string().min(1, 'يرجى اختيار المساعد'),
});

export type CreateGroupFormData = z.infer<typeof createGroupSchema>;

export interface CreateGroupScreenProps {
  onSuccess?: (groupId: string) => void;
}

/** Figma Days (39:289): Saturday first (rightmost), one letter per day. */
const DAY_ORDER = [6, 7, 1, 2, 3, 4, 5] as const;
const DAY_LETTERS: Record<number, string> = {
  6: 'س',
  7: 'ح',
  1: 'ن',
  2: 'ث',
  3: 'ر',
  4: 'خ',
  5: 'ج',
};

type PickerRole = 'teacher' | 'assistant';

function StaffPickerRow({
  selected,
  placeholder,
  roleLabel,
  error,
  disabled,
  onPress,
  testID,
}: {
  selected: UserListItem | null;
  placeholder: string;
  roleLabel: string;
  error?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const name = selected ? selected.full_name || selected.email : null;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${roleLabel}: ${name ?? placeholder}`}
      accessibilityState={{ disabled }}
      className={`${rowStart} items-center gap-2.5 w-full rounded-md bg-surface dark:bg-surface-dark px-3.5 py-3 active:opacity-80 ${
        error
          ? 'border-[1.5px] border-line-error'
          : 'border border-line dark:border-line-dark'
      } ${disabled ? 'opacity-60' : ''}`}
      style={{ borderCurve: 'continuous' }}
    >
      <View className="w-8 h-8 rounded-full bg-primary-subtle dark:bg-primary-subtle-dark items-center justify-center">
        <Icon name="shield" size={16} tone="brand" />
      </View>
      <View className={`flex-1 ${itemsStart}`}>
        <Text
          numberOfLines={1}
          className={`w-full ${typography.bodyMdMedium} text-right ${
            name
              ? 'text-fg dark:text-fg-dark'
              : 'text-fg-tertiary dark:text-fg-tertiary-dark'
          }`}
        >
          {name ?? placeholder}
        </Text>
        <Text
          className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        >
          {roleLabel}
        </Text>
      </View>
      <Icon name="chevron-down" size={18} tone="tertiary" />
    </Pressable>
  );
}

/**
 * SCR-28 Create Group (Figma 39:230): name, gender segments, the 7-day
 * picker (fixed at creation, BR), and Teacher/Assistant pickers opening a
 * candidate sheet. Validation and the 409/422 handling are unchanged.
 */
export function CreateGroupScreen({ onSuccess }: CreateGroupScreenProps) {
  const router = useRouter();
  const colors = useThemeColors();

  // Form state
  const [name, setName] = useState('');
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [gender, setGender] = useState<'Male' | 'Female' | null>(null);
  const [recitationDay, setRecitationDay] = useState<number | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<PickerRole | null>(null);

  // Staff options state
  const [teachers, setTeachers] = useState<UserListItem[]>([]);
  const [assistants, setAssistants] = useState<UserListItem[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Validation & submission state
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStaff = useCallback(async () => {
    setIsLoadingStaff(true);
    setStaffError(null);
    try {
      const [teachersRes, assistantsRes] = await Promise.all([
        listUsersByRole('Teacher'),
        listUsersByRole('Assistant'),
      ]);
      setTeachers(teachersRes.data);
      setAssistants(assistantsRes.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setStaffError(
          err.message || 'تعذر تحميل قائمة الكادر الإداري والتعليمي',
        );
      } else {
        setStaffError('تعذر الاتصال بالخادم لتحميل قائمة المعلمين والمساعدين.');
      }
    } finally {
      setIsLoadingStaff(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const triggerHaptic = () => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.selectionAsync();
      } catch {
        // Ignored
      }
    }
  };

  const clearError = (field: string) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const handleGenderSelect = (selected: 'Male' | 'Female') => {
    triggerHaptic();
    setGender(selected);
    clearError('gender');
  };

  const handleDaySelect = (day: number) => {
    triggerHaptic();
    setRecitationDay(day);
    clearError('recitation_day');
  };

  const handleStaffSelect = (sectionKey: string, id: string) => {
    triggerHaptic();
    if (sectionKey === 'teacher') {
      setTeacherId(id);
      clearError('teacher_id');
    } else {
      setAssistantId(id);
      clearError('assistant_id');
    }
    setOpenPicker(null);
  };

  const handleSubmit = async () => {
    setGeneralError(null);

    const validationResult = createGroupSchema.safeParse({
      name,
      gender: gender || '',
      recitation_day: recitationDay ?? undefined,
      teacher_id: teacherId || '',
      assistant_id: assistantId || '',
    });

    if (!validationResult.success) {
      const fieldErrors = validationResult.error.flatten().fieldErrors;
      setErrors({
        name: fieldErrors.name?.[0],
        gender: fieldErrors.gender?.[0],
        recitation_day: fieldErrors.recitation_day?.[0],
        teacher_id: fieldErrors.teacher_id?.[0],
        assistant_id: fieldErrors.assistant_id?.[0],
      });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const response = await createGroup({
        name: name.trim(),
        gender: gender!,
        recitation_day: recitationDay!,
        teacher_id: teacherId!,
        assistant_id: assistantId!,
      });

      const newGroupId = response.data.id;
      if (onSuccess) {
        onSuccess(newGroupId);
      } else {
        router.replace({
          pathname: '/admin/groups/[id]',
          params: { id: newGroupId },
        });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 409 || err.errorCode === 'GROUP_NAME_TAKEN') {
          // 409 is a business rule / state conflict -> render as top banner (UF.md §21)
          setGeneralError(err.message || 'اسم المجموعة مستخدم بالفعل');
        } else if (err.statusCode === 422 && err.details) {
          const newErrors: Record<string, string> = {};
          for (const detail of err.details) {
            if (detail.field) {
              newErrors[detail.field] = detail.message;
            }
          }
          setErrors(newErrors);
        } else {
          setGeneralError(err.message || 'حدث خطأ أثناء إنشاء المجموعة');
        }
      } else {
        setGeneralError('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTeacher = teachers.find((t) => t.id === teacherId) ?? null;
  const selectedAssistant =
    assistants.find((a) => a.id === assistantId) ?? null;

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="create-group-screen"
    >
      <TopBar title="مجموعة جديدة" testID="create-group-top-bar" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Heading */}
        <View className={`w-full gap-1 ${itemsStart}`}>
          <Text
            accessibilityRole="header"
            className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
          >
            إعداد المجموعة
          </Text>
          <Text
            className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            تُنشأ المجموعة مغلقة التسجيل ونشطة. يوم التسميع لا يُعدَّل لاحقًا.
          </Text>
        </View>

        {/* General Error Banner (409 Conflict / Network) */}
        {generalError ? (
          <Banner
            tone="error"
            icon="alert"
            message={generalError}
            testID="create-group-general-error"
          />
        ) : null}

        {/* Form */}
        <View className="w-full gap-5 pt-1.5">
          {/* 1. Group Name */}
          <FormField
            label="اسم المجموعة"
            required
            helpText="يجب أن يكون فريدًا"
            error={errors.name}
            testID="group-name-field"
            className="mb-0"
          >
            <TextInput
              testID="group-name-input"
              className={getInputClassName({
                error: Boolean(errors.name),
                focused: isNameFocused,
              })}
              style={{ borderCurve: 'continuous' }}
              placeholder="مثال: حلقة الفجر"
              placeholderTextColor={colors.textTertiary}
              editable={!isSubmitting}
              value={name}
              onChangeText={(text) => {
                setName(text);
                clearError('name');
              }}
              onFocus={() => setIsNameFocused(true)}
              onBlur={() => setIsNameFocused(false)}
              textAlign="right"
              selectionColor={colors.textBrand}
            />
          </FormField>

          {/* 2. Gender */}
          <FormField
            label="الجنس"
            required
            error={errors.gender}
            testID="group-gender-field"
            className="mb-0"
          >
            <SegmentedControl<'Male' | 'Female'>
              options={[
                { label: 'ذكور', value: 'Male' },
                { label: 'إناث', value: 'Female' },
              ]}
              value={gender}
              onChange={handleGenderSelect}
              disabled={isSubmitting}
              accessibilityLabel="الجنس"
              testID="gender"
            />
          </FormField>

          {/* 3. Recitation Day */}
          <FormField
            label="يوم التسميع"
            required
            error={errors.recitation_day}
            helpText={
              recitationDay !== null
                ? `${RECITATION_DAYS_MAP[recitationDay]} — يُثبَّت عند الإنشاء`
                : undefined
            }
            testID="group-recitation-day-field"
            className="mb-0"
          >
            <View className={`${rowStart} items-start gap-1.5 w-full`}>
              {DAY_ORDER.map((day) => {
                const isSelected = recitationDay === day;
                return (
                  <Pressable
                    key={day}
                    testID={`recitation-day-option-${day}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={RECITATION_DAYS_MAP[day]}
                    onPress={() => handleDaySelect(day)}
                    disabled={isSubmitting}
                    className={`flex-1 h-11 rounded-sm items-center justify-center active:opacity-80 ${
                      isSelected
                        ? 'bg-primary dark:bg-primary-dark'
                        : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark'
                    }`}
                    style={{ borderCurve: 'continuous' }}
                  >
                    <Text
                      className={`${typography.labelMd} text-center ${
                        isSelected
                          ? 'text-fg-on-primary'
                          : 'text-fg dark:text-fg-dark'
                      }`}
                      maxFontSizeMultiplier={1.4}
                    >
                      {DAY_LETTERS[day]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </FormField>

          {/* 4. Staff */}
          {isLoadingStaff ? (
            <View testID="staff-loading-skeleton" className="w-full">
              <SkeletonLoader count={2} variant="row" />
            </View>
          ) : staffError ? (
            <Banner
              tone="error"
              message={staffError}
              onRetry={fetchStaff}
              testID="staff-error"
            />
          ) : (
            <>
              <FormField
                label="المعلّم"
                required
                error={errors.teacher_id}
                testID="teacher-select-field"
                className="mb-0"
              >
                <StaffPickerRow
                  selected={selectedTeacher}
                  placeholder={
                    teachers.length === 0
                      ? 'لا يوجد معلمون مسجلون حاليًا'
                      : 'اختر المعلّم'
                  }
                  roleLabel="معلّم"
                  error={Boolean(errors.teacher_id)}
                  disabled={isSubmitting || teachers.length === 0}
                  onPress={() => setOpenPicker('teacher')}
                  testID="teacher-picker"
                />
              </FormField>

              <FormField
                label="المساعد"
                required
                error={errors.assistant_id}
                testID="assistant-select-field"
                className="mb-0"
              >
                <StaffPickerRow
                  selected={selectedAssistant}
                  placeholder={
                    assistants.length === 0
                      ? 'لا يوجد مساعدون إداريون مسجلون حاليًا'
                      : 'اختر المساعد'
                  }
                  roleLabel="مساعد"
                  error={Boolean(errors.assistant_id)}
                  disabled={isSubmitting || assistants.length === 0}
                  onPress={() => setOpenPicker('assistant')}
                  testID="assistant-picker"
                />
              </FormField>
            </>
          )}
        </View>

        {/* Submit Button */}
        <Button
          label="إنشاء المجموعة"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
          testID="create-group-submit-button"
          className="mt-2"
        />
      </ScrollView>

      <StaffPickerSheet
        visible={openPicker !== null}
        title={openPicker === 'assistant' ? 'اختيار المساعد' : 'اختيار المعلّم'}
        subtitle="الاختيار من قائمة المستخدمين بالدور المطابق."
        sections={
          openPicker === 'assistant'
            ? [
                {
                  key: 'assistant',
                  label: 'المساعد',
                  roleLabel: 'مساعد',
                  candidates: assistants,
                  selectedId: assistantId,
                  emptyMessage: 'لا يوجد مساعدون إداريون مسجلون حاليًا',
                },
              ]
            : [
                {
                  key: 'teacher',
                  label: 'المعلّم',
                  roleLabel: 'معلّم',
                  candidates: teachers,
                  selectedId: teacherId,
                  emptyMessage: 'لا يوجد معلمون مسجلون حاليًا',
                },
              ]
        }
        activeKey={openPicker ?? 'teacher'}
        onSelect={handleStaffSelect}
        onClose={() => setOpenPicker(null)}
        testID="staff-picker"
        optionTestID={(key, id) => `${key}-option-${id}`}
      />
    </KeyboardAvoidingView>
  );
}
