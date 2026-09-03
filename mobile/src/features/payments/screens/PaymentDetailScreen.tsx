import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Banner } from '@/shared/components/Banner';
import { CycleRow } from '@/shared/components/CycleRow';
import { Dialog } from '@/shared/components/Dialog';
import { EmptyState } from '@/shared/components/EmptyState';
import { SkeletonBlock } from '@/shared/components/SkeletonRow';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { Toast } from '@/shared/components/Toast';
import { TopBar } from '@/shared/components/TopBar';
import { ApiError } from '@/shared/api/types';
import { PaymentCycleDto } from '@/shared/api/payments.client';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { useAssignedGroups } from '@/features/groups/hooks/useAssignedGroups';
import { useGroupPayments } from '../hooks/useGroupPayments';
import { useRecordPayment } from '../hooks/useRecordPayment';
import { UNNAMED_STUDENT_LABEL } from '../components/StudentLedgerRow';
import {
  CYCLE_STATUS_VARIANT,
  formatArrearsCountLabel,
  formatArrearsTotal,
  formatCycleSubtitle,
  formatCycleTitle,
  formatLedgerMeta,
  formatMarkPaidTitle,
} from '../utils/paymentCopy';

/** Figma 36:579 — the overline above the cycle list. */
export const CYCLE_LIST_LABEL = 'الدورات — أي ترتيب';

/** Figma 36:618 — UF §25's strongest copy: no correction path exists. */
export const MARK_PAID_WARNING =
  'لا يمكن التراجع عن هذا الإجراء — لا يوجد خيار تصحيح أو إلغاء.';
export const MARK_PAID_CONFIRM_LABEL = 'تأكيد التسجيل';
export const MARK_PAID_CANCEL_LABEL = 'إلغاء';

/** UF §18 success (`201`): the badge flips to Paid, with a quiet toast. */
export const RECORDED_TOAST = 'تم تسجيل الدفع';
/** UF §18 `409`: another Assistant got there first — no error tone. */
export const ALREADY_PAID_TOAST = 'سُجِّلت هذه الدورة كمدفوعة بالفعل';

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل سجلّ المدفوعات';
/** Server error 5xx on the write path (UF §24). */
const RECORD_ERROR_MESSAGE = 'تعذر تسجيل الدفع. يرجى المحاولة مرة أخرى.';
/** The student is no longer in the ledger this screen was opened from. */
export const STUDENT_NOT_FOUND_MESSAGE = 'لم يعد هذا الطالب ضمن هذه المجموعة';

/**
 * Maps an error to the user-facing Arabic message per UF §24's table:
 * network and `5xx` → generic retry copy, the server string never shown;
 * any remaining `4xx` carries the exception filter's Arabic message. `401`
 * is refreshed silently by the API client and never reaches here.
 */
function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.statusCode >= 500 ? fallback : error.message || fallback;
  }
  return NETWORK_ERROR_MESSAGE;
}

/**
 * SCR-21 Payment Detail (F-PAY-03, UF §18/§25; Figma 36:543 and the
 * mark-paid confirmation 36:618): the arrears summary, then every derived
 * cycle newest-first with "تسجيل الدفع" on each one that is not yet Paid.
 *
 * The ledger is the very rows SCR-20 already holds — this screen selects
 * its student out of `GET /groups/{id}/payments` (API-046) rather than
 * asking for a per-student endpoint that does not exist. Everything shown
 * is derived server-side by DS-06 (ADR-006): the screen computes no status,
 * no cycle boundary and no due date. The one client-side arithmetic UF §18
 * authorises is the arrears total, `arrears_count × 30`, over the fixed
 * public fee (BR-31) — the API returns no money amount.
 *
 * Recording is BR-56/FR-PAY-11 "any order": every unpaid cycle carries its
 * own button, and no earlier cycle has to be settled first. Each press goes
 * through the strong confirm dialog UF §25 mandates, because **no
 * correction or reversal path exists anywhere** (ISS-02/APIQ-02) — and
 * accordingly this screen offers no undo, no edit and no delete on a cycle
 * that is already Paid.
 */
export function PaymentDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; groupId?: string }>();
  const membershipId = params.id ?? null;
  const groupId = params.groupId ?? null;

  const [pendingCycle, setPendingCycle] = useState<PaymentCycleDto | null>(
    null,
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);

  const groupsQuery = useAssignedGroups();
  // The unfiltered slice — the same query key SCR-20 primed, so arriving
  // here usually costs no request at all (TS §26).
  const ledgerQuery = useGroupPayments(groupId, undefined);
  const recordMutation = useRecordPayment();

  const ledger = useMemo(
    () =>
      ledgerQuery.data?.find((entry) => entry.membership_id === membershipId) ??
      null,
    [ledgerQuery.data, membershipId],
  );
  const group = groupsQuery.data?.find((item) => item.id === groupId) ?? null;

  const studentName = ledger?.full_name?.trim() || UNNAMED_STUDENT_LABEL;
  const isLoading = groupsQuery.isLoading || ledgerQuery.isLoading;
  const isError = groupsQuery.isError || ledgerQuery.isError;
  const error = groupsQuery.error ?? ledgerQuery.error;

  const handleConfirm = () => {
    if (!pendingCycle || !membershipId) return;
    setRecordError(null);
    recordMutation.mutate(
      { membershipId, cycleIndex: pendingCycle.index },
      {
        onSuccess: (outcome) => {
          setPendingCycle(null);
          setToastMessage(
            outcome.kind === 'recorded' ? RECORDED_TOAST : ALREADY_PAID_TOAST,
          );
        },
        // UF §18: on a network or server error the dialog stays open so the
        // Assistant can retry; the failure is shown inside it (UF §32).
        onError: (err) =>
          setRecordError(describeError(err, RECORD_ERROR_MESSAGE)),
      },
    );
  };

  let body: React.ReactElement;

  if (!membershipId || !groupId) {
    body = (
      <Banner
        tone="error"
        message={STUDENT_NOT_FOUND_MESSAGE}
        testID="payment-detail-invalid-params"
      />
    );
  } else if (isLoading) {
    // UF §22: the skeleton matches the layout it replaces — the summary
    // card, the section label and the 76px cycle rows.
    body = (
      <View className="w-full gap-3.5" testID="payment-detail-skeleton">
        <View
          className={`${rowStart} items-center justify-between w-full px-5 py-4 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark`}
          style={{ borderCurve: 'continuous' }}
          accessibilityLabel="جارٍ التحميل"
        >
          <View className={`flex-1 gap-2 ${itemsStart}`}>
            <SkeletonBlock className="w-2/5 h-4 rounded-sm" />
            <SkeletonBlock tone="subtle" className="w-3/5 h-3 rounded-sm" />
          </View>
          <SkeletonBlock className="w-24 h-7 rounded-md" />
        </View>
        <SkeletonLoader
          variant="reportRow"
          count={4}
          testID="payment-detail-skeleton-rows"
        />
      </View>
    );
  } else if (isError) {
    body = (
      <Banner
        tone="error"
        message={describeError(error, SERVER_ERROR_MESSAGE)}
        onRetry={() => {
          void groupsQuery.refetch();
          void ledgerQuery.refetch();
        }}
        testID="payment-detail-error"
      />
    );
  } else if (!ledger) {
    body = (
      <EmptyState
        message={STUDENT_NOT_FOUND_MESSAGE}
        icon="user-x"
        testID="payment-detail-missing"
      />
    );
  } else {
    // Ascending on the wire (cycle 0 first); Figma lists newest-first.
    const newestFirst = [...ledger.cycles].reverse();
    const hasArrears = ledger.arrears_count > 0;

    body = (
      <View className="w-full gap-3.5" testID="payment-detail-content">
        {/* Summary (Figma 36:573): error-toned while cycles are overdue,
            plain surface once nothing is — Figma draws only the first, and
            an error-red "0 دينارًا" would misreport a settled student. */}
        <View
          testID="payment-detail-summary"
          accessible
          accessibilityRole="text"
          accessibilityLabel={[
            formatArrearsCountLabel(ledger.arrears_count),
            hasArrears ? formatArrearsTotal(ledger.arrears_count) : null,
          ]
            .filter(Boolean)
            .join('، ')}
          className={`${rowStart} items-center justify-between w-full px-5 py-4 rounded-lg border ${
            hasArrears
              ? 'bg-error-subtle border-line-error'
              : 'bg-surface dark:bg-surface-dark border-line dark:border-line-dark'
          }`}
          style={{ borderCurve: 'continuous' }}
        >
          <View className={`flex-1 ${itemsStart}`}>
            <Text
              numberOfLines={1}
              className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
              maxFontSizeMultiplier={1.6}
              testID="payment-detail-arrears-count"
            >
              {formatArrearsCountLabel(ledger.arrears_count)}
            </Text>
            <Text
              numberOfLines={2}
              className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
              maxFontSizeMultiplier={1.6}
              testID="payment-detail-meta"
            >
              {formatLedgerMeta(group?.name, ledger.cycles[0]?.start_date)}
            </Text>
          </View>
          {hasArrears ? (
            <Text
              className={`${typography.headingLg} text-left text-fg-error`}
              adjustsFontSizeToFit
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              testID="payment-detail-arrears-total"
            >
              {formatArrearsTotal(ledger.arrears_count)}
            </Text>
          ) : null}
        </View>

        <View className={`w-full pt-1.5 ${rowStart}`}>
          <Text
            className={`${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            accessibilityRole="header"
            testID="payment-detail-cycle-list-label"
          >
            {CYCLE_LIST_LABEL}
          </Text>
        </View>

        <View className="w-full gap-2.5" testID="payment-detail-cycle-list">
          {newestFirst.map((cycle) => (
            <CycleRow
              key={cycle.index}
              role="assistant"
              status={CYCLE_STATUS_VARIANT[cycle.status]}
              title={formatCycleTitle(cycle)}
              subtitle={formatCycleSubtitle(cycle)}
              loading={
                recordMutation.isPending && pendingCycle?.index === cycle.index
              }
              onMarkPaid={() => {
                setRecordError(null);
                setPendingCycle(cycle);
              }}
              testID={`payment-detail-cycle-row-${cycle.index}`}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="payment-detail-screen"
    >
      <TopBar title={studentName} testID="payment-detail-top-bar" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {toastMessage ? (
          <Toast
            message={toastMessage}
            onDismiss={() => setToastMessage(null)}
            testID="payment-detail-toast"
          />
        ) : null}
        {body}
      </ScrollView>

      <Dialog
        visible={pendingCycle !== null}
        weight="strong"
        title={pendingCycle ? formatMarkPaidTitle(pendingCycle) : ''}
        body={MARK_PAID_WARNING}
        confirmLabel={MARK_PAID_CONFIRM_LABEL}
        cancelLabel={MARK_PAID_CANCEL_LABEL}
        loading={recordMutation.isPending}
        error={recordError}
        onConfirm={handleConfirm}
        onCancel={() => {
          setPendingCycle(null);
          setRecordError(null);
        }}
        testID="payment-detail-confirm"
      />
    </View>
  );
}
