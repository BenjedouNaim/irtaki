import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { CYCLE_STATUS_BADGE } from '@/shared/components/CycleRow';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { GroupStudentLedgerDto } from '@/shared/api/payments.client';
import {
  CYCLE_STATUS_VARIANT,
  formatArrearsBadgeLabel,
  formatCurrentCycleSubtitle,
} from '../utils/paymentCopy';

/** Shown in place of a name the API returned as `null` — never invented. */
export const UNNAMED_STUDENT_LABEL = 'طالب بلا اسم مسجَّل';

/** First letter of the student's name for the avatar ring. */
export function nameInitial(fullName: string | null): string {
  return fullName?.trim().charAt(0) || '؟';
}

export interface StudentLedgerRowProps {
  ledger: GroupStudentLedgerDto;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma SCR-20 ledger row (36:450): avatar initial (right), name + the
 * current cycle's end date, then the current-cycle StatusBadge and — only
 * when `arrears_count > 0` — an error "N متأخرة" badge beside it (UF §18
 * "name · current-cycle badge · arrears badge if >0").
 *
 * The current cycle is the last one the API returned: DS-06 derives cycles
 * up to today or the FR-PAY-12 stop, so the newest entry is the live one.
 * The row computes no status and no date boundary of its own.
 *
 * Figma's leading chevron and the push to SCR-21 Payment Detail are absent:
 * that screen is F-PAY-03's, and a chevron with no destination would be a
 * dead affordance (the Assistant Home group rows drop theirs the same way).
 */
export function StudentLedgerRow({
  ledger,
  testID = `payment-ledger-row-${ledger.membership_id}`,
  style,
}: StudentLedgerRowProps) {
  const current = ledger.cycles[ledger.cycles.length - 1];
  const badge = current
    ? CYCLE_STATUS_BADGE[CYCLE_STATUS_VARIANT[current.status]]
    : null;
  const name = ledger.full_name?.trim() || UNNAMED_STUDENT_LABEL;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={[
        name,
        badge?.label,
        ledger.arrears_count > 0
          ? formatArrearsBadgeLabel(ledger.arrears_count)
          : null,
      ]
        .filter(Boolean)
        .join('، ')}
      className={`${rowStart} items-center w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-4 py-3.5 gap-2.5`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="w-9 h-9 rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center">
        <Text
          className={`${typography.labelMd} text-center text-fg-secondary dark:text-fg-secondary-dark`}
          maxFontSizeMultiplier={1.3}
        >
          {nameInitial(ledger.full_name)}
        </Text>
      </View>

      <View className={`flex-1 gap-0.5 ${itemsStart}`}>
        <Text
          numberOfLines={1}
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
          testID={`${testID}-name`}
        >
          {name}
        </Text>
        {current ? (
          <Text
            numberOfLines={1}
            className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID={`${testID}-current-cycle`}
          >
            {formatCurrentCycleSubtitle(current)}
          </Text>
        ) : null}
      </View>

      <View className={`${rowStart} items-center gap-1.5`}>
        {badge ? (
          <StatusBadge
            status={badge.label}
            variant={badge.variant}
            testID={`${testID}-status`}
          />
        ) : null}
        {ledger.arrears_count > 0 ? (
          <StatusBadge
            status={formatArrearsBadgeLabel(ledger.arrears_count)}
            variant="error"
            testID={`${testID}-arrears`}
          />
        ) : null}
      </View>
    </View>
  );
}
