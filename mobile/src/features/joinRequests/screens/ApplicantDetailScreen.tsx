import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Banner } from '@/shared/components/Banner';
import { Button } from '@/shared/components/Button';
import { ConfirmationDialog } from '@/shared/components/ConfirmationDialog';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import {
  StatusBadge,
  StatusBadgeVariant,
} from '@/shared/components/StatusBadge';
import { TopBar } from '@/shared/components/TopBar';
import { typography } from '@/shared/theme/typography';
import { useThemeColors } from '@/shared/theme/colors';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import {
  getJoinRequestDetail,
  acceptJoinRequest,
  rejectJoinRequest,
  ApplicantProfile,
} from '@/shared/api/joinRequests.client';
import { ApiError } from '@/shared/api/types';
import { AhzabChipGrid } from '../components/AhzabChipGrid';
import { nameInitial } from '../components/JoinRequestQueueRow';

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toISOString().split('T')[0];
  } catch {
    return isoString;
  }
}

function mapTajweedLevel(level: string): string {
  switch (level) {
    case 'Beginner':
      return 'مبتدئ';
    case 'Intermediate':
      return 'متوسط';
    case 'Advanced':
      return 'متقدم';
    default:
      return level;
  }
}

function mapProgramGoal(goal: string): string {
  switch (goal) {
    case 'Memorization':
      return 'حفظ';
    case 'Revision':
      return 'مراجعة فقط';
    default:
      return goal;
  }
}

function mapGender(gender: string): string {
  switch (gender) {
    case 'Male':
      return 'ذكر';
    case 'Female':
      return 'أنثى';
    default:
      return gender;
  }
}

function mapStatus(status: string): {
  label: string;
  variant: StatusBadgeVariant;
} {
  switch (status) {
    case 'Pending':
      return { label: 'قيد المراجعة', variant: 'warning' };
    case 'Accepted':
      return { label: 'تم القبول', variant: 'success' };
    case 'Rejected':
      return { label: 'لم يُقبل', variant: 'neutral' };
    default:
      return { label: status, variant: 'neutral' };
  }
}

/** "N ahzab" with Arabic number agreement (Figma 35:259). */
export function formatAhzabCount(count: number): string {
  if (count === 0) return 'لا أحزاب';
  if (count === 1) return 'حزب واحد';
  if (count === 2) return 'حزبان';
  if (count <= 10) return `${count} أحزاب`;
  return `${count} حزبًا`;
}

const CARD_CLASS =
  'w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark';

/** Figma Applicant Detail label/value row (35:228): 44px, label right, value left. */
function DetailRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID: string;
}) {
  return (
    <View
      className={`${rowStart} items-center justify-between min-h-[44px] gap-3 w-full`}
      testID={`row-${testID}`}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text
        className={`flex-1 ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        maxFontSizeMultiplier={1.6}
      >
        {label}
      </Text>
      <Text
        selectable
        className={`${typography.bodyMdMedium} text-left text-fg dark:text-fg-dark`}
        style={{ fontVariant: ['tabular-nums'] }}
        testID={`field-${testID}`}
        maxFontSizeMultiplier={1.6}
      >
        {value}
      </Text>
    </View>
  );
}

function SectionCard({
  title,
  children,
  testID,
}: {
  title: string;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View
      className={`${CARD_CLASS} px-4 py-3 gap-1 ${itemsStart}`}
      style={{ borderCurve: 'continuous' }}
      testID={testID}
    >
      <Text
        className={`w-full ${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * SCR-19 Applicant Detail (Figma 35:183) with the Accept (35:395) and
 * Reject (53:585) confirmations (UF §13, §25). Email is never rendered
 * (APIQ-04); the applicant score sorts the queue and is shown to the
 * assistant only.
 */
export function ApplicantDetailScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ id: string }>();
  const requestId = params.id;

  const [applicant, setApplicant] = useState<ApplicantProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(
    null,
  );
  const [showRejectConfirmModal, setShowRejectConfirmModal] = useState(false);
  const [isRejectSubmitting, setIsRejectSubmitting] = useState(false);
  const [rejectActionErrorMessage, setRejectActionErrorMessage] = useState<
    string | null
  >(null);

  const fetchDetail = useCallback(async () => {
    if (!requestId) {
      setErrorMessage('معرف طلب الانضمام غير صالح');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getJoinRequestDetail(requestId);
      setApplicant(response.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل تفاصيل طلب الانضمام');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  const handleRefresh = useCallback(async () => {
    if (!requestId) return;

    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const response = await getJoinRequestDetail(requestId);
      setApplicant(response.data);
      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {
          // Ignore
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحديث تفاصيل طلب الانضمام');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleBack = () => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Fallback
      }
    }
    router.back();
  };

  const handleOpenAcceptConfirm = () => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Ignored
      }
    }
    setActionErrorMessage(null);
    setShowConfirmModal(true);
  };

  const handleConfirmAccept = async () => {
    if (!requestId) return;

    setIsSubmitting(true);
    setActionErrorMessage(null);

    try {
      await acceptJoinRequest(requestId);

      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        } catch {
          // Ignored
        }
      }

      setShowConfirmModal(false);
      router.back();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.errorCode === 'ALREADY_DECIDED') {
          setActionErrorMessage('تم اتخاذ قرار بشأن هذا الطلب مسبقاً');
        } else if (err.errorCode === 'APPLICANT_NO_LONGER_ELIGIBLE') {
          setActionErrorMessage('المتقدم مسجل بالفعل في حلقة نشطة أخرى');
        } else {
          setActionErrorMessage(err.message || 'حدث خطأ أثناء قبول الطلب');
        }
      } else {
        setActionErrorMessage(
          'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenRejectConfirm = () => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Ignored
      }
    }
    setRejectActionErrorMessage(null);
    setShowRejectConfirmModal(true);
  };

  const handleConfirmReject = async () => {
    if (!requestId) return;

    setIsRejectSubmitting(true);
    setRejectActionErrorMessage(null);

    try {
      await rejectJoinRequest(requestId);

      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        } catch {
          // Ignored
        }
      }

      setShowRejectConfirmModal(false);
      router.back();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.errorCode === 'ALREADY_DECIDED') {
          setRejectActionErrorMessage('تم اتخاذ قرار بشأن هذا الطلب مسبقاً');
        } else {
          setRejectActionErrorMessage(err.message || 'حدث خطأ أثناء رفض الطلب');
        }
      } else {
        setRejectActionErrorMessage(
          'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.',
        );
      }
    } finally {
      setIsRejectSubmitting(false);
    }
  };

  const statusConfig = applicant ? mapStatus(applicant.status) : null;
  const actionsBusy = isSubmitting || isRejectSubmitting;

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="applicant-detail-screen"
    >
      <TopBar
        title="طلب الانضمام"
        onBack={handleBack}
        testID="applicant-detail-top-bar"
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 4,
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 16,
        }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textBrand}
            colors={[colors.textBrand]}
          />
        }
      >
        {isLoading ? (
          <View testID="applicant-detail-skeleton" className="w-full gap-4">
            <View className={CARD_CLASS} style={{ borderCurve: 'continuous' }}>
              <SkeletonLoader variant="card" />
            </View>
            <View
              className={`${CARD_CLASS} px-4 py-3`}
              style={{ borderCurve: 'continuous' }}
            >
              <SkeletonLoader variant="metricRow" count={4} />
            </View>
          </View>
        ) : errorMessage ? (
          <Banner
            message={errorMessage}
            tone="error"
            onRetry={fetchDetail}
            testID="applicant-detail-error"
          />
        ) : applicant ? (
          <View className="w-full gap-4" testID="applicant-detail-content">
            {/* Header (Figma 35:214): avatar · name + status + meta · score */}
            <View
              className={`${CARD_CLASS} ${rowStart} items-center gap-3.5 px-5 py-[18px]`}
              style={{ borderCurve: 'continuous' }}
              testID="applicant-profile-card"
            >
              <View className="w-[52px] h-[52px] rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center">
                <Text
                  className={`${typography.headingMd} text-center text-fg-secondary dark:text-fg-secondary-dark`}
                  maxFontSizeMultiplier={1.3}
                >
                  {nameInitial(applicant.full_name)}
                </Text>
              </View>

              <View className={`flex-1 gap-1 ${itemsStart}`}>
                <Text
                  selectable
                  className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
                  testID="applicant-full-name"
                  accessibilityRole="header"
                >
                  {applicant.full_name}
                </Text>
                {statusConfig && (
                  <StatusBadge
                    status={statusConfig.label}
                    variant={statusConfig.variant}
                    testID="applicant-status-badge"
                  />
                )}
                <View className={`${rowStart} items-center gap-1`}>
                  <Text
                    className={`${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                    testID="field-gender"
                  >
                    {mapGender(applicant.gender)}
                  </Text>
                  <Text
                    className={`${typography.bodySm} text-fg-secondary dark:text-fg-secondary-dark`}
                  >
                    ·
                  </Text>
                  <Text
                    className={`${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                    testID="field-created-at"
                  >
                    {`قُدِّم في ${formatDate(applicant.created_at)}`}
                  </Text>
                </View>
              </View>

              <View
                className="items-center rounded-md bg-primary-subtle dark:bg-primary-subtle-dark px-3 py-1.5"
                style={{ borderCurve: 'continuous' }}
                testID="applicant-score-container"
                accessibilityRole="text"
                accessibilityLabel={`نقاط الطلب: ${applicant.score}`}
              >
                <Text
                  selectable
                  className={`${typography.headingLg} text-center text-brand dark:text-brand-dark`}
                  style={{ fontVariant: ['tabular-nums'] }}
                  testID="applicant-score"
                  maxFontSizeMultiplier={1.5}
                >
                  {applicant.score}
                </Text>
                <Text
                  className={`${typography.caption} text-center text-brand dark:text-brand-dark`}
                  maxFontSizeMultiplier={1.5}
                >
                  نقاط الطلب
                </Text>
              </View>
            </View>

            <SectionCard
              title="البيانات الشخصية"
              testID="applicant-personal-card"
            >
              <DetailRow
                label="العمر"
                value={`${applicant.age} سنة`}
                testID="age"
              />
              <DetailRow
                label="الهاتف"
                value={applicant.phone_number}
                testID="phone"
              />
              <DetailRow
                label="المهنة"
                value={applicant.occupation}
                testID="occupation"
              />
              <DetailRow label="المدينة" value={applicant.city} testID="city" />
            </SectionCard>

            <SectionCard title="التجويد والهدف" testID="applicant-tajweed-card">
              <DetailRow
                label="مستوى التجويد"
                value={mapTajweedLevel(applicant.tajweed_level)}
                testID="tajweed-level"
              />
              <DetailRow
                label="درس أحكام التجويد"
                value={applicant.studied_tajweed_theory ? 'نعم' : 'لا'}
                testID="tajweed-theory"
              />
              <DetailRow
                label="درس رواية قالون"
                value={applicant.studied_qalun ? 'نعم' : 'لا'}
                testID="studied-qalun"
              />
              <DetailRow
                label="الهدف"
                value={mapProgramGoal(applicant.program_goal)}
                testID="program-goal"
              />
              <DetailRow
                label="وافق على الرسوم"
                value={applicant.fee_agreement ? 'نعم' : 'لا'}
                testID="fee-agreement"
              />
            </SectionCard>

            {/* Memorized Ahzab (Figma 35:257) — read-only grid (UF §19) */}
            <View
              className={`${CARD_CLASS} p-4 gap-3 ${itemsStart}`}
              style={{ borderCurve: 'continuous' }}
              testID="applicant-ahzab-section"
            >
              <View
                className={`${rowStart} items-center justify-between w-full`}
              >
                <Text
                  className={`${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                  testID="applicant-ahzab-title"
                  accessibilityRole="header"
                >
                  الأحزاب المحفوظة
                </Text>
                <Text
                  className={`${typography.labelMd} text-left text-brand dark:text-brand-dark`}
                  style={{ fontVariant: ['tabular-nums'] }}
                  testID="applicant-ahzab-count"
                >
                  {formatAhzabCount(applicant.memorized_ahzab.length)}
                </Text>
              </View>

              <AhzabChipGrid
                selectedAhzab={applicant.memorized_ahzab}
                readOnly
                testID="applicant-ahzab-grid"
              />
            </View>

            {/* Decision (Figma 35:388; F-ENR-05 & F-ENR-06) */}
            {applicant.status === 'Pending' && (
              <View
                className="w-full pt-2 gap-2.5"
                testID="applicant-actions-card"
              >
                {actionErrorMessage && (
                  <Banner
                    message={actionErrorMessage}
                    tone="error"
                    testID="accept-action-error"
                  />
                )}

                {rejectActionErrorMessage && (
                  <Banner
                    message={rejectActionErrorMessage}
                    tone="error"
                    testID="reject-action-error"
                  />
                )}

                <Button
                  label="قبول الطلب"
                  variant="primary"
                  onPress={handleOpenAcceptConfirm}
                  disabled={actionsBusy}
                  loading={isSubmitting}
                  testID="accept-join-request-button"
                  className="w-full"
                />

                <Button
                  label="رفض الطلب"
                  variant="outline"
                  onPress={handleOpenRejectConfirm}
                  disabled={actionsBusy}
                  loading={isRejectSubmitting}
                  testID="reject-join-request-button"
                  className="w-full"
                  style={
                    actionsBusy
                      ? undefined
                      : { borderColor: colors.borderError }
                  }
                  textStyle={
                    actionsBusy ? undefined : { color: colors.textError }
                  }
                />

                <ConfirmationDialog
                  visible={showConfirmModal}
                  title={`قبول طلب ${applicant.full_name}؟`}
                  message="سيتم إنشاء عضوية في المجموعة وبدء دورة الدفع الأولى فورًا."
                  confirmLabel="قبول"
                  cancelLabel="إلغاء"
                  weight="standard"
                  loading={isSubmitting}
                  onConfirm={handleConfirmAccept}
                  onCancel={() => {
                    if (!isSubmitting) setShowConfirmModal(false);
                  }}
                  testID="accept-confirm-dialog"
                />

                <ConfirmationDialog
                  visible={showRejectConfirmModal}
                  title={`رفض طلب ${applicant.full_name}؟`}
                  message="قرار نهائي بلا سبب مُسجَّل. يمكنه التقديم مجددًا فورًا على أي مجموعة متاحة."
                  confirmLabel="رفض الطلب"
                  cancelLabel="إلغاء"
                  weight="strong"
                  loading={isRejectSubmitting}
                  onConfirm={handleConfirmReject}
                  onCancel={() => {
                    if (!isRejectSubmitting) setShowRejectConfirmModal(false);
                  }}
                  testID="reject-confirm-dialog"
                />
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
