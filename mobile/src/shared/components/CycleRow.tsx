import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Button } from './Button';
import { StatusBadge, StatusBadgeVariant } from './StatusBadge';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

export type CycleRowRole = 'student' | 'assistant';
/** Figma CycleRow.Status — Paid · DueSoon · Unpaid. */
export type CycleStatus = 'paid' | 'dueSoon' | 'unpaid';

export const CYCLE_STATUS_BADGE: Record<
  CycleStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  paid: { label: 'مدفوع', variant: 'success' },
  dueSoon: { label: 'يستحق قريبًا', variant: 'warning' },
  unpaid: { label: 'غير مدفوع', variant: 'error' },
};

export const MARK_PAID_LABEL = 'تسجيل الدفع';

export interface CycleRowProps {
  role: CycleRowRole;
  status: CycleStatus;
  /** e.g. "الدورة 3 · 1 أوت — 30 أوت 2026". */
  title: string;
  /** e.g. "30 دينار" or the paid-at date. */
  subtitle?: string;
  /** Assistant only: "Mark as Paid" on unpaid / due-soon cycles. */
  onMarkPaid?: () => void;
  markPaidLabel?: string;
  loading?: boolean;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma CycleRow (19:158): 76px surface card. Student: title + subtitle +
 * StatusBadge. Assistant: StatusBadge when Paid, small outline "تسجيل
 * الدفع" button otherwise (any order, BR-56; strong confirm dialog is the
 * caller's). Component only — the payments feature is not wired.
 */
export function CycleRow({
  role,
  status,
  title,
  subtitle,
  onMarkPaid,
  markPaidLabel = MARK_PAID_LABEL,
  loading = false,
  testID = 'cycle-row',
  className,
  style,
}: CycleRowProps) {
  const badge = CYCLE_STATUS_BADGE[status];
  const showMarkPaid = role === 'assistant' && status !== 'paid';

  return (
    <View
      testID={testID}
      className={`${rowStart} items-center h-[76px] px-4 gap-3 w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View
        className={`flex-1 gap-0.5 ${itemsStart}`}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${title}${subtitle ? `، ${subtitle}` : ''}، ${badge.label}`}
      >
        <Text
          testID={`${testID}-title`}
          numberOfLines={2}
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            testID={`${testID}-subtitle`}
            numberOfLines={1}
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showMarkPaid ? (
        <Button
          label={markPaidLabel}
          variant="outline"
          size="small"
          loading={loading}
          disabled={!onMarkPaid}
          onPress={() => onMarkPaid?.()}
          testID={`${testID}-mark-paid`}
          className="w-[120px]"
        />
      ) : (
        <StatusBadge
          status={badge.label}
          variant={badge.variant}
          testID={`${testID}-badge`}
        />
      )}
    </View>
  );
}
