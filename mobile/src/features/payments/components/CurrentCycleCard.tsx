import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { CYCLE_STATUS_BADGE } from '@/shared/components/CycleRow';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { PaymentCycleDto } from '@/shared/api/payments.client';
import { formatArabicFullDate } from '@/features/dailyReports/utils/arabicDate';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { CYCLE_AMOUNT_LABEL, CYCLE_STATUS_VARIANT } from '../utils/paymentCopy';

export const CURRENT_CYCLE_LABEL = 'الدورة الحالية';
export const NEXT_DUE_CAPTION = 'موعد الاستحقاق القادم';
/** `next_due_date` is null only when every derived cycle is already paid. */
export const NO_DUE_DATE_VALUE = '—';
export const NO_DUE_DATE_CAPTION = 'لا توجد دورة مستحقة حاليًا';

/** OS text scaling must never clip the date (UF §32). */
const DATE_MAX_FONT_SIZE_MULTIPLIER = 1.4;

export interface CurrentCycleCardProps {
  /** The most recent derived cycle — the current one while cycles advance. */
  cycle: PaymentCycleDto;
  /** `PaymentLedgerDto.next_due_date`; `null` when nothing is unpaid. */
  nextDueDate: string | null;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * SCR-16's "Current" card (Figma 30:729): the current cycle's StatusBadge
 * beside the "الدورة الحالية" label, the next due date as the hero line and
 * the fixed 30 TND fee under it (UF §18 "Status badge (current cycle) —
 * Next due date").
 *
 * The due date is the end of the OLDEST unpaid cycle (DEC-B06), which is
 * exactly what the API returns — the card never recomputes it. A `null`
 * date is rendered as a null, never as a zero or a guessed date
 * (DEC-B04 / API-X07).
 */
export function CurrentCycleCard({
  cycle,
  nextDueDate,
  testID = 'current-cycle-card',
  className,
  style,
}: CurrentCycleCardProps) {
  const badge = CYCLE_STATUS_BADGE[CYCLE_STATUS_VARIANT[cycle.status]];

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      className={`w-full p-5 gap-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${itemsStart} ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className={`w-full ${rowStart} items-center justify-between gap-3`}>
        <Text
          className={`${typography.labelSm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          testID={`${testID}-label`}
        >
          {CURRENT_CYCLE_LABEL}
        </Text>
        <StatusBadge
          status={badge.label}
          variant={badge.variant}
          testID={`${testID}-badge`}
        />
      </View>

      <Text
        className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
        testID={`${testID}-due-date`}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={DATE_MAX_FONT_SIZE_MULTIPLIER}
      >
        {nextDueDate ? formatArabicFullDate(nextDueDate) : NO_DUE_DATE_VALUE}
      </Text>

      <Text
        className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        testID={`${testID}-caption`}
        maxFontSizeMultiplier={DATE_MAX_FONT_SIZE_MULTIPLIER}
      >
        {nextDueDate
          ? `${NEXT_DUE_CAPTION} · ${CYCLE_AMOUNT_LABEL}`
          : NO_DUE_DATE_CAPTION}
      </Text>
    </View>
  );
}
