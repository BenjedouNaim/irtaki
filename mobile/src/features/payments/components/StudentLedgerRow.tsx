import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Icon } from '@/shared/components/Icon';
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
  /** Opens SCR-21 Payment Detail; omitted, the row stays inert text. */
  onPress?: () => void;
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
 * With `onPress` the row becomes the push into SCR-21 Payment Detail
 * (UF §18 "→ Payment Detail") and grows Figma's trailing chevron; without
 * it the chevron is dropped rather than promising a destination that isn't
 * there (the Assistant Home group rows behave the same way).
 */
export function StudentLedgerRow({
  ledger,
  onPress,
  testID = `payment-ledger-row-${ledger.membership_id}`,
  style,
}: StudentLedgerRowProps) {
  const current = ledger.cycles[ledger.cycles.length - 1];
  const badge = current
    ? CYCLE_STATUS_BADGE[CYCLE_STATUS_VARIANT[current.status]]
    : null;
  const name = ledger.full_name?.trim() || UNNAMED_STUDENT_LABEL;

  const accessibilityLabel = [
    name,
    badge?.label,
    ledger.arrears_count > 0
      ? formatArrearsBadgeLabel(ledger.arrears_count)
      : null,
  ]
    .filter(Boolean)
    .join('، ');

  const rowClass = `${rowStart} items-center w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-4 py-3.5 gap-2.5`;
  const Row = onPress ? Pressable : View;

  return (
    <Row
      testID={testID}
      accessible
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={`${rowClass}${onPress ? ' active:opacity-80' : ''}`}
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

      {onPress ? (
        <Icon
          name="chevron-left"
          size={18}
          tone="tertiary"
          testID={`${testID}-chevron`}
        />
      ) : null}
    </Row>
  );
}
