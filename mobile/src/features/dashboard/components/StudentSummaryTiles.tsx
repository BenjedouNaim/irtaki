import React from 'react';
import { Pressable, View, Text } from 'react-native';
import {
  MetricTile,
  METRIC_TILE_NULL_VALUE,
} from '@/shared/components/MetricTile';
import { METRIC_NULL_PLACEHOLDER } from '@/shared/components/MetricRow';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { CYCLE_STATUS_BADGE } from '@/shared/components/CycleRow';
import { CYCLE_STATUS_VARIANT } from '@/features/payments/utils/paymentCopy';
import { formatArrearsCountLabel } from '@/features/payments/utils/paymentCopy';
import { formatArabicDayMonth } from '@/features/dailyReports/utils/arabicDate';
import type { StudentPaymentDto } from '@/shared/api/dashboard.client';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { formatRate } from '../utils/dashboardCopy';

export interface StudentSummaryTilesProps {
  /** `commitment_score` — API-009's Student payload. */
  commitmentScore: number | null;
  /** `payment` — null only when the caller has no Active membership. */
  payment: StudentPaymentDto | null;
  /** UF §10 "Payment chip — Tap → Payment tab". */
  onOpenPayments?: () => void;
  testID?: string;
}

/**
 * Figma 24:112 captions the score "آخر 7 أيام". The figure is not a rolling
 * 7-day window though — API-009 resolves the score over the current REPORTING
 * week (UC-07 step 1, BR-15's recitation-day anchor), which is what SCR-13's
 * default period shows too. The caption says that instead, in the wording
 * SCR-22's greeting already uses, and stays distinct from the WeeklyStrip
 * card's own "هذا الأسبوع" heading directly above it.
 */
const SCORE_CAPTION = 'الأسبوع الحالي';
const SCORE_LABEL = 'نسبة الالتزام';
const PAYMENT_LABEL = 'الدفع';

/**
 * SCR-08's tile row (Figma 24:105): the commitment score and the payment
 * chip, side by side, both read off the ONE `GET /me/dashboard` call
 * (UF §10, F-DASH-01). Score first so it lands rightmost (UF §31).
 *
 * Neither figure is ever defaulted: a null `commitment_score` renders
 * MetricTile's documented null state ("—" + "بيانات غير كافية"), never `0%`
 * (DEC-B04 / API-X07, UF §10 "null → not enough data").
 */
export function StudentSummaryTiles({
  commitmentScore,
  payment,
  onOpenPayments,
  testID = 'student-summary-tiles',
}: StudentSummaryTilesProps) {
  return (
    <View className={`w-full ${rowStart} gap-3 items-stretch`} testID={testID}>
      <MetricTile
        label={SCORE_LABEL}
        value={formatRate(commitmentScore)}
        caption={SCORE_CAPTION}
        testID={`${testID}-score`}
      />
      <PaymentChip
        payment={payment}
        onPress={onOpenPayments}
        testID={`${testID}-payment`}
      />
    </View>
  );
}

interface PaymentChipProps {
  payment: StudentPaymentDto | null;
  onPress?: () => void;
  testID: string;
}

/**
 * Figma 24:106 — the payment tile: label, the current cycle's StatusBadge
 * and a caption. The badge reuses the app's single payment-status vocabulary
 * (`CYCLE_STATUS_BADGE`), so Home and the Payment tab can never disagree
 * about what "يستحق قريبًا" looks like.
 *
 * The caption carries the arrears when there are any — UF §10 names all
 * three of `status`, `next_due_date` and `arrears_count` as the chip's
 * source, and an overdue student needs the count more than the next date.
 */
function PaymentChip({ payment, onPress, testID }: PaymentChipProps) {
  const badge = payment
    ? CYCLE_STATUS_BADGE[CYCLE_STATUS_VARIANT[payment.status]]
    : null;

  const caption =
    payment === null
      ? METRIC_NULL_PLACEHOLDER
      : payment.arrears_count > 0
        ? formatArrearsCountLabel(payment.arrears_count)
        : payment.next_due_date
          ? `الاستحقاق ${formatArabicDayMonth(payment.next_due_date)}`
          : null;

  const accessibilityLabel = `${PAYMENT_LABEL}: ${
    badge ? badge.label : METRIC_NULL_PLACEHOLDER
  }${caption && payment ? `، ${caption}` : ''}`;

  const body = (
    <>
      <Text
        testID={`${testID}-label`}
        className={`w-full ${typography.labelSm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        maxFontSizeMultiplier={1.5}
      >
        {PAYMENT_LABEL}
      </Text>
      {badge ? (
        <StatusBadge
          status={badge.label}
          variant={badge.variant}
          testID={`${testID}-badge`}
        />
      ) : (
        <Text
          testID={`${testID}-value`}
          className={`w-full ${typography.headingXl} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
          numberOfLines={1}
          maxFontSizeMultiplier={1.5}
        >
          {METRIC_TILE_NULL_VALUE}
        </Text>
      )}
      {caption ? (
        <Text
          testID={`${testID}-caption`}
          className={`w-full ${typography.caption} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
          maxFontSizeMultiplier={1.5}
        >
          {caption}
        </Text>
      ) : null}
    </>
  );

  const className = `flex-1 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-4 pt-4 pb-3.5 gap-1.5 ${itemsStart} ${
    onPress ? 'active:opacity-80' : ''
  }`;

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={className}
        style={{ borderCurve: 'continuous' }}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      className={className}
      style={{ borderCurve: 'continuous' }}
    >
      {body}
    </View>
  );
}
