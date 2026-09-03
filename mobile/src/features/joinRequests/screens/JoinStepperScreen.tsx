import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Banner } from '@/shared/components/Banner';
import { Button } from '@/shared/components/Button';
import { Checkbox } from '@/shared/components/Checkbox';
import { EmptyState } from '@/shared/components/EmptyState';
import { FormField, getInputClassName } from '@/shared/components/FormField';
import { Icon } from '@/shared/components/Icon';
import { ListRow } from '@/shared/components/ListRow';
import { SegmentedControl } from '@/shared/components/SegmentedControl';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { StepIndicator } from '@/shared/components/StepIndicator';
import { Toast } from '@/shared/components/Toast';
import { TopBar } from '@/shared/components/TopBar';
import { typography } from '@/shared/theme/typography';
import { useThemeColors } from '@/shared/theme/colors';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { AhzabChipGrid } from '../components/AhzabChipGrid';
import { GroupDetailSheet } from '../components/GroupDetailSheet';
import {
  listAvailableGroups,
  GroupListItemLimited,
} from '@/shared/api/groups.client';
import {
  submitJoinRequest,
  SubmitJoinRequestPayload,
} from '@/shared/api/joinRequests.client';
import { ApiError } from '@/shared/api/types';

export const RECITATION_DAYS_MAP: Record<number, string> = {
  1: 'الإثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
  7: 'الأحد',
};

export function getRecitationDayName(day: number): string {
  return RECITATION_DAYS_MAP[day] || `يوم ${day}`;
}

export type TajweedLevel = 'Beginner' | 'Intermediate' | 'Advanced';

type Gender = 'Male' | 'Female';
type YesNo = 'yes' | 'no';
type GoalOption = 'memorization' | 'revision';

/** Network / 5xx while listing groups (UF §24, Figma 54:4561). */
const GROUPS_ERROR_MESSAGE =
  'تعذّر تحميل المجموعات. جنسك محفوظ — أعد المحاولة.';
/** EC-09 / VR-34 — group closed at final submit (Figma 54:4748). */
const GROUP_UNAVAILABLE_TOAST = 'المجموعة لم تعد متاحة — حُدِّثت القائمة';
/** BR-36 — Revision-only applications are blocked client-side. */
const REVISION_BLOCK_MESSAGE =
  'عذراً، التسجيل متاح حالياً فقط لبرنامج الحفظ والمتابعة اليومية. لا يمكن قبول طلبات المراجعة فقط في هذا الوقت.';
/** Fee agreement (VR-06) — 30 TND per 3-month cycle (SRS business value). */
const FEE_AGREEMENT_LABEL =
  'أوافق على دفع رسوم المركز (30 دينارًا لكل دورة من 3 أشهر) في مواعيدها.';

const TAJWEED_OPTIONS: { label: string; value: TajweedLevel }[] = [
  { label: 'مبتدئ', value: 'Beginner' },
  { label: 'متوسط', value: 'Intermediate' },
  { label: 'متقدم', value: 'Advanced' },
];
const YES_NO_OPTIONS: { label: string; value: YesNo }[] = [
  { label: 'نعم', value: 'yes' },
  { label: 'لا', value: 'no' },
];
const GOAL_OPTIONS: { label: string; value: GoalOption }[] = [
  { label: 'حفظ', value: 'memorization' },
  { label: 'مراجعة فقط', value: 'revision' },
];

function toYesNo(value: boolean | null): YesNo | null {
  if (value === null) return null;
  return value ? 'yes' : 'no';
}

function GenderOption({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`flex-1 items-center justify-center gap-2.5 py-6 rounded-lg active:opacity-80 ${
        selected
          ? 'bg-primary-subtle dark:bg-primary-subtle-dark border-[1.5px] border-line-brand dark:border-line-brand-dark'
          : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark'
      }`}
      style={{ borderCurve: 'continuous' }}
    >
      <View
        className={`w-12 h-12 rounded-full items-center justify-center ${
          selected
            ? 'bg-primary dark:bg-primary-dark'
            : 'bg-subtle dark:bg-subtle-dark'
        }`}
      >
        <Icon
          name="user"
          size={21}
          tone={selected ? 'on-primary' : 'secondary'}
        />
      </View>
      <Text
        className={`${typography.headingSm} text-center ${
          selected
            ? 'text-brand dark:text-brand-dark'
            : 'text-fg dark:text-fg-dark'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className={`w-full gap-1 ${itemsStart}`}>
      <Text
        className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <Text
        className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {subtitle}
      </Text>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      className={`w-full mb-4 ${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      accessibilityRole="header"
    >
      {children}
    </Text>
  );
}

function InlineError({
  message,
  testID,
}: {
  message: string;
  testID?: string;
}) {
  return (
    <View
      className={`${rowStart} items-center gap-1 w-full mt-2`}
      testID={testID}
      accessibilityRole="alert"
    >
      <Icon name="alert" size={16} tone="error" accessibilityLabel="تنبيه" />
      <Text className={`flex-1 ${typography.bodySm} text-right text-fg-error`}>
        {message}
      </Text>
    </View>
  );
}

/**
 * SCR-06 Join Stepper (Figma 22:139 · 22:201 · 22:290 · 54:4561 · 54:4735 ·
 * 23:258) with the SCR-07 group sheet (23:230 · 54:4622). Gender → eligible
 * groups → profile (UF §11, §13); the top-bar back control steps backwards.
 */
export function JoinStepperScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedGender, setSelectedGender] = useState<Gender | null>(null);

  const [groups, setGroups] = useState<GroupListItemLimited[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [groupUnavailableNotice, setGroupUnavailableNotice] = useState<
    string | null
  >(null);

  // Group Detail sheet (SCR-07) state
  const [selectedGroup, setSelectedGroup] =
    useState<GroupListItemLimited | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Step 3 Form State
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [occupation, setOccupation] = useState('');
  const [city, setCity] = useState('');
  const [memorizedAhzab, setMemorizedAhzab] = useState<number[]>([]);
  const [tajweedLevel, setTajweedLevel] = useState<TajweedLevel | null>(null);
  const [studiedTajweedTheory, setStudiedTajweedTheory] = useState<
    boolean | null
  >(null);
  const [studiedQalun, setStudiedQalun] = useState<boolean | null>(null);
  const [programGoal, setProgramGoal] = useState<'Memorization' | 'Revision'>(
    'Memorization',
  );
  const [feeAgreement, setFeeAgreement] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Submission & Form Errors State
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const triggerHaptic = (type: 'selection' | 'impact' = 'selection') => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        if (type === 'selection') {
          Haptics.selectionAsync();
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } catch {
        // Ignored
      }
    }
  };

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const fetchGroups = useCallback(async (gender: Gender) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await listAvailableGroups(gender);
      setGroups(response.data as GroupListItemLimited[]);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode < 500) {
        setErrorMessage(err.message || GROUPS_ERROR_MESSAGE);
      } else {
        setErrorMessage(GROUPS_ERROR_MESSAGE);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleGenderSelect = (gender: Gender) => {
    triggerHaptic('selection');
    setSelectedGender(gender);
  };

  const handleProceedToStep2 = async () => {
    if (!selectedGender) return;
    setStep(2);
    await fetchGroups(selectedGender);
  };

  const handleBackToStep1 = () => {
    setStep(1);
    setGroups([]);
    setErrorMessage(null);
    setGroupUnavailableNotice(null);
  };

  const handleOpenGroupDetail = (group: GroupListItemLimited) => {
    triggerHaptic('impact');
    setSelectedGroup(group);
    setShowDetailModal(true);
  };

  const handleCloseGroupDetail = () => {
    setShowDetailModal(false);
    // UF §11 — a group that closed since listing refreshes the list on close.
    if (
      selectedGroup &&
      selectedGroup.enrollment_status !== 'Open' &&
      selectedGender
    ) {
      fetchGroups(selectedGender);
    }
  };

  const handleProceedToStep3 = () => {
    setShowDetailModal(false);
    setFieldErrors({});
    setSubmitError(null);
    setGroupUnavailableNotice(null);
    setStep(3);
  };

  const handleBackToStep2 = () => {
    setStep(2);
    setSubmitError(null);
  };

  const handleTopBarBack = () => {
    if (step === 1) {
      router.back();
    } else if (step === 2) {
      handleBackToStep1();
    } else {
      handleBackToStep2();
    }
  };

  // Client-side validation for form readiness
  const isFormValid =
    Boolean(fullName.trim().length >= 3) &&
    Boolean(age.trim() && parseInt(age, 10) > 0) &&
    Boolean(phoneNumber.trim().length >= 8) &&
    Boolean(occupation.trim()) &&
    Boolean(city.trim()) &&
    memorizedAhzab.length >= 5 &&
    tajweedLevel !== null &&
    studiedTajweedTheory !== null &&
    studiedQalun !== null &&
    programGoal === 'Memorization' &&
    feeAgreement === true;

  const handleSubmit = async () => {
    if (!isFormValid || !selectedGroup || !selectedGender || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setSubmitError(null);

    const payload: SubmitJoinRequestPayload = {
      group_id: selectedGroup.id,
      full_name: fullName.trim(),
      gender: selectedGender,
      age: parseInt(age.trim(), 10),
      phone_number: phoneNumber.trim(),
      occupation: occupation.trim(),
      city: city.trim(),
      memorized_ahzab: memorizedAhzab,
      tajweed_level: tajweedLevel,
      studied_tajweed_theory: Boolean(studiedTajweedTheory),
      studied_qalun: Boolean(studiedQalun),
      fee_agreement: feeAgreement,
      program_goal: programGoal,
    };

    try {
      await submitJoinRequest(payload);
      triggerHaptic('impact');
      router.replace('/(app)/user');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.statusCode === 422 && err.details) {
          const errorsMap: Record<string, string> = {};
          for (const detail of err.details) {
            errorsMap[detail.field] = detail.message;
          }
          setFieldErrors(errorsMap);
          setSubmitError(err.message || 'يرجى تصحيح الأخطاء الموضحة أدناه');
        } else if (
          err.statusCode === 409 &&
          err.errorCode === 'GROUP_UNAVAILABLE'
        ) {
          // Group became unavailable -> return to Step 2 and refresh (EC-09)
          setStep(2);
          setGroupUnavailableNotice(GROUP_UNAVAILABLE_TOAST);
          fetchGroups(selectedGender);
        } else if (err.statusCode === 409) {
          // Duplicate submit race -> silent success per UF.md §13
          router.replace('/(app)/user');
        } else if (err.statusCode >= 500) {
          setSubmitError('حدث خطأ أثناء إرسال الطلب. أعد المحاولة.');
        } else {
          setSubmitError(err.message || 'حدث خطأ أثناء إرسال الطلب');
        }
      } else {
        setSubmitError(
          'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (field: string) =>
    getInputClassName({
      error: Boolean(fieldErrors[field]),
      focused: focusedField === field,
    });

  const genderLabel = selectedGender === 'Female' ? 'للإناث' : 'للذكور';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas dark:bg-canvas-dark"
    >
      <TopBar
        title="طلب الانضمام"
        onBack={handleTopBarBack}
        testID="join-stepper-top-bar"
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 8,
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 24,
        }}
        contentInsetAdjustmentBehavior="automatic"
        testID="join-stepper-screen"
        keyboardShouldPersistTaps="handled"
      >
        <StepIndicator step={step} testID="step-indicator" />

        {/* Step 1: Gender (Figma 22:139) */}
        {step === 1 && (
          <View className="flex-1 gap-6" testID="step1-gender">
            <StepHeading
              title="ما جنسك؟"
              subtitle="تُعرض عليك مجموعات الجنس نفسه فقط. يُسجَّل هذا مرة واحدة."
            />
            <View
              className={`${rowStart} items-start gap-3 w-full`}
              accessibilityRole="radiogroup"
            >
              <GenderOption
                label="ذكر"
                selected={selectedGender === 'Male'}
                onPress={() => handleGenderSelect('Male')}
                testID="gender-male-option"
              />
              <GenderOption
                label="أنثى"
                selected={selectedGender === 'Female'}
                onPress={() => handleGenderSelect('Female')}
                testID="gender-female-option"
              />
            </View>
            <View className="flex-1" />
            <Button
              label="متابعة"
              onPress={handleProceedToStep2}
              disabled={!selectedGender}
              testID="step1-submit-button"
              className="w-full"
            />
          </View>
        )}

        {/* Step 2: Eligible groups (Figma 22:201 · 22:290 · 54:4561) */}
        {step === 2 && (
          <View className="gap-6" testID="step2-groups">
            <StepHeading
              title="المجموعات المتاحة"
              subtitle="الاسم ويوم التسميع فقط — اضغط على مجموعة للاطلاع والتقديم."
            />

            {isLoading && (
              <SkeletonLoader variant="row" count={3} testID="groups-loading" />
            )}

            {!isLoading && errorMessage && (
              <Banner
                message={errorMessage}
                tone="error"
                onRetry={() => selectedGender && fetchGroups(selectedGender)}
                testID="groups-error-banner"
              />
            )}

            {!isLoading && !errorMessage && groups.length === 0 && (
              <EmptyState
                message={`لا توجد مجموعات متاحة ${genderLabel} حاليًا`}
                icon="layers"
                testID="empty-groups-state"
              />
            )}

            {!isLoading && !errorMessage && groups.length > 0 && (
              <View className="w-full gap-2.5" testID="available-groups-list">
                {groups.map((group) => (
                  <ListRow
                    key={group.id}
                    title={group.name}
                    subtitle={`يوم التسميع: ${getRecitationDayName(group.recitation_day)}`}
                    leadingIcon="layers"
                    trailing="chevron"
                    onPress={() => handleOpenGroupDetail(group)}
                    testID={`group-card-${group.id}`}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Step 3: Profile (Figma 23:258 · UF §13) */}
        {step === 3 && (
          <View className="gap-6" testID="step3-profile-form">
            <StepHeading
              title="ملفك الشخصي"
              subtitle="تُملأ هذه البيانات مع كل طلب. تُعرض على مساعد المجموعة فقط."
            />

            {submitError && (
              <Banner
                message={submitError}
                tone="error"
                testID="form-error-banner"
              />
            )}

            <View className="w-full">
              <SectionLabel>البيانات الأساسية</SectionLabel>

              <FormField
                label="الاسم الكامل"
                required
                error={fieldErrors['full_name']}
                testID="field-full-name"
              >
                <TextInput
                  value={fullName}
                  onChangeText={(text) => {
                    setFullName(text);
                    clearFieldError('full_name');
                  }}
                  onFocus={() => setFocusedField('full_name')}
                  onBlur={() => setFocusedField(null)}
                  placeholderTextColor={colors.textTertiary}
                  textAlign="right"
                  className={inputClass('full_name')}
                  style={{ borderCurve: 'continuous' }}
                  testID="input-full-name"
                />
              </FormField>

              <View className={`${rowStart} items-start gap-3 w-full`}>
                <View className="flex-1">
                  <FormField
                    label="العمر"
                    required
                    error={fieldErrors['age']}
                    testID="field-age"
                  >
                    <TextInput
                      value={age}
                      onChangeText={(text) => {
                        setAge(text.replace(/[^0-9]/g, ''));
                        clearFieldError('age');
                      }}
                      onFocus={() => setFocusedField('age')}
                      onBlur={() => setFocusedField(null)}
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                      textAlign="right"
                      className={inputClass('age')}
                      style={{ borderCurve: 'continuous' }}
                      testID="input-age"
                    />
                  </FormField>
                </View>
                <View className="flex-1">
                  <FormField
                    label="رقم الهاتف"
                    required
                    error={fieldErrors['phone_number']}
                    testID="field-phone-number"
                  >
                    <TextInput
                      value={phoneNumber}
                      onChangeText={(text) => {
                        setPhoneNumber(text);
                        clearFieldError('phone_number');
                      }}
                      onFocus={() => setFocusedField('phone_number')}
                      onBlur={() => setFocusedField(null)}
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="phone-pad"
                      textAlign="right"
                      className={inputClass('phone_number')}
                      style={{ borderCurve: 'continuous' }}
                      testID="input-phone-number"
                    />
                  </FormField>
                </View>
              </View>

              <FormField
                label="المهنة"
                required
                error={fieldErrors['occupation']}
                testID="field-occupation"
              >
                <TextInput
                  value={occupation}
                  onChangeText={(text) => {
                    setOccupation(text);
                    clearFieldError('occupation');
                  }}
                  onFocus={() => setFocusedField('occupation')}
                  onBlur={() => setFocusedField(null)}
                  placeholderTextColor={colors.textTertiary}
                  textAlign="right"
                  className={inputClass('occupation')}
                  style={{ borderCurve: 'continuous' }}
                  testID="input-occupation"
                />
              </FormField>

              <FormField
                label="المدينة"
                required
                error={fieldErrors['city']}
                testID="field-city"
              >
                <TextInput
                  value={city}
                  onChangeText={(text) => {
                    setCity(text);
                    clearFieldError('city');
                  }}
                  onFocus={() => setFocusedField('city')}
                  onBlur={() => setFocusedField(null)}
                  placeholderTextColor={colors.textTertiary}
                  textAlign="right"
                  className={inputClass('city')}
                  style={{ borderCurve: 'continuous' }}
                  testID="input-city"
                />
              </FormField>
            </View>

            <View className="w-full">
              <SectionLabel>الحفظ والتجويد</SectionLabel>

              <View className="w-full mb-4" testID="field-memorized-ahzab">
                <AhzabChipGrid
                  label="الأحزاب المحفوظة"
                  required
                  selectedAhzab={memorizedAhzab}
                  onChange={(selected) => {
                    setMemorizedAhzab(selected);
                    clearFieldError('memorized_ahzab');
                  }}
                  error={fieldErrors['memorized_ahzab']}
                />
              </View>

              <FormField
                label="مستوى التجويد"
                required
                error={fieldErrors['tajweed_level']}
                testID="field-tajweed-level"
              >
                <SegmentedControl<TajweedLevel>
                  options={TAJWEED_OPTIONS}
                  value={tajweedLevel}
                  onChange={(value) => {
                    triggerHaptic('selection');
                    setTajweedLevel(value);
                    clearFieldError('tajweed_level');
                  }}
                  accessibilityLabel="مستوى التجويد"
                  testID="tajweed-option"
                />
              </FormField>

              <FormField
                label="هل درست أحكام التجويد نظريًا؟"
                required
                error={fieldErrors['studied_tajweed_theory']}
                testID="field-tajweed-theory"
              >
                <SegmentedControl<YesNo>
                  options={YES_NO_OPTIONS}
                  value={toYesNo(studiedTajweedTheory)}
                  onChange={(value) => {
                    triggerHaptic('selection');
                    setStudiedTajweedTheory(value === 'yes');
                    clearFieldError('studied_tajweed_theory');
                  }}
                  accessibilityLabel="درست أحكام التجويد نظريًا:"
                  testID="theory"
                />
              </FormField>

              <FormField
                label="هل درست رواية قالون؟"
                required
                error={fieldErrors['studied_qalun']}
                testID="field-studied-qalun"
              >
                <SegmentedControl<YesNo>
                  options={YES_NO_OPTIONS}
                  value={toYesNo(studiedQalun)}
                  onChange={(value) => {
                    triggerHaptic('selection');
                    setStudiedQalun(value === 'yes');
                    clearFieldError('studied_qalun');
                  }}
                  accessibilityLabel="درست رواية قالون:"
                  testID="qalun"
                />
              </FormField>

              <FormField
                label="هدفك من البرنامج"
                required
                error={fieldErrors['program_goal']}
                testID="field-program-goal"
              >
                <SegmentedControl<GoalOption>
                  options={GOAL_OPTIONS}
                  value={
                    programGoal === 'Revision' ? 'revision' : 'memorization'
                  }
                  onChange={(value) => {
                    triggerHaptic('selection');
                    setProgramGoal(
                      value === 'revision' ? 'Revision' : 'Memorization',
                    );
                    clearFieldError('program_goal');
                  }}
                  accessibilityLabel="هدفك من البرنامج"
                  testID="goal"
                />
                {programGoal === 'Revision' && (
                  <Banner
                    tone="warning"
                    message={REVISION_BLOCK_MESSAGE}
                    testID="revision-block-notice"
                    className="mt-2"
                  />
                )}
              </FormField>
            </View>

            <View className="w-full">
              <SectionLabel>الالتزام</SectionLabel>
              <Checkbox
                checked={feeAgreement}
                onChange={(checked) => {
                  triggerHaptic('selection');
                  setFeeAgreement(checked);
                  clearFieldError('fee_agreement');
                }}
                label={FEE_AGREEMENT_LABEL}
                accessibilityLabel={FEE_AGREEMENT_LABEL}
                testID="fee-agreement-checkbox"
                className="w-full"
              />
              {fieldErrors['fee_agreement'] ? (
                <InlineError
                  message={fieldErrors['fee_agreement']}
                  testID="fee-agreement-error"
                />
              ) : null}
            </View>

            <Button
              label="إرسال الطلب"
              onPress={handleSubmit}
              disabled={!isFormValid}
              loading={isSubmitting}
              testID="submit-application-button"
              className="w-full"
            />
          </View>
        )}
      </ScrollView>

      {groupUnavailableNotice ? (
        <View
          className="absolute left-4 right-4"
          style={{ bottom: insets.bottom + 16 }}
          pointerEvents="box-none"
        >
          <Toast
            message={groupUnavailableNotice}
            icon="alert"
            onDismiss={() => setGroupUnavailableNotice(null)}
            testID="group-unavailable-notice"
          />
        </View>
      ) : null}

      {/* SCR-07 Group Detail sheet */}
      <GroupDetailSheet
        visible={showDetailModal}
        group={selectedGroup}
        recitationDayName={
          selectedGroup
            ? getRecitationDayName(selectedGroup.recitation_day)
            : ''
        }
        onApply={handleProceedToStep3}
        onClose={handleCloseGroupDetail}
        testID="group-detail-modal"
      />
    </KeyboardAvoidingView>
  );
}
