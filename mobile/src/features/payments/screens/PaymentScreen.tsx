import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Banner } from '@/shared/components/Banner';
import { CycleRow } from '@/shared/components/CycleRow';
import { SkeletonBlock } from '@/shared/components/SkeletonRow';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { TopBar } from '@/shared/components/TopBar';
import { ApiError } from '@/shared/api/types';
import { PaymentCycleDto } from '@/shared/api/payments.client';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { useMyPayments } from '../hooks/useMyPayments';
import { CurrentCycleCard } from '../components/CurrentCycleCard';
import {
  CYCLE_STATUS_VARIANT,
  formatArrearsMessage,
  formatCycleSubtitle,
  formatCycleTitle,
} from '../utils/paymentCopy';

export const PAYMENT_SCREEN_TITLE = 'الدفع';
/** Figma 30:760 — the overline above the cycle list. */
export const CYCLE_LIST_LABEL = 'سجلّ الدورات';

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل سجلّ الدفع';

/**
 * Maps a query error to the user-facing Arabic message per UF §24's table:
 * network and `5xx` → generic retry copy, the server string never shown;
 * any remaining `4xx` carries the exception filter's Arabic message. `401`
 * is refreshed silently by the API client and never reaches here.
 */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      return SERVER_ERROR_MESSAGE;
    }
    return error.message || SERVER_ERROR_MESSAGE;
  }
  return NETWORK_ERROR_MESSAGE;
}

/**
 * SCR-16 Payment tab (F-PAY-01, UF §18; Figma 30:701): the current cycle
 * card, the arrears banner when `arrears_count > 0`, and the full
 * cycle-by-cycle list — never a compact summary (UXQ-10).
 *
 * Everything is derived server-side by DS-06 (ADR-006) and rendered as
 * returned: the screen computes no status, no due date and no cycle
 * boundary. The one client-side arithmetic UF §18 does authorise is the
 * arrears total, `arrears_count × 30`, over the fixed public fee (BR-31).
 *
 * The badge on the card is the most recent cycle's status — cycles are
 * derived up to today (or the FR-PAY-12 stop), so the last entry is the
 * current one. Rows run newest-first, as Figma lays them out.
 *
 * There is no empty state: cycle 0 exists from membership creation
 * (UF §22). There is no action of any kind — recording a payment is the
 * Assistant's, and no correction path exists anywhere (ISS-02).
 */
export function PaymentScreen() {
  const { data, isLoading, isError, error, refetch } = useMyPayments();

  let body: React.ReactElement;

  if (isLoading && !data) {
    body = (
      <View className="w-full gap-4" testID="payment-skeleton">
        {/* UF §22: the skeleton matches the layout it replaces — the current
            card (badge, hero date, caption) then the cycle rows. */}
        <View
          className={`w-full p-5 gap-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${itemsStart}`}
          style={{ borderCurve: 'continuous' }}
          accessibilityLabel="جارٍ التحميل"
        >
          <SkeletonBlock
            tone="subtle"
            className="w-24 h-7 rounded-full"
            testID="payment-skeleton-badge"
          />
          <SkeletonBlock className="w-3/5 h-8 rounded-md" />
          <SkeletonBlock tone="subtle" className="w-4/5 h-4 rounded-sm" />
        </View>
        <SkeletonLoader
          variant="reportRow"
          count={4}
          testID="payment-skeleton-rows"
        />
      </View>
    );
  } else if (isError || !data) {
    body = (
      <Banner
        tone="error"
        message={describeError(error)}
        onRetry={() => void refetch()}
        testID="payment-error"
      />
    );
  } else {
    // Ascending on the wire (cycle 0 first); Figma lists newest-first.
    const newestFirst = [...data.cycles].reverse();
    const current: PaymentCycleDto | undefined = newestFirst[0];

    body = (
      <View className="w-full gap-4" testID="payment-content">
        {current ? (
          <CurrentCycleCard
            cycle={current}
            nextDueDate={data.next_due_date}
            testID="current-cycle-card"
          />
        ) : null}

        {data.arrears_count > 0 ? (
          <Banner
            tone="warning"
            icon="coins"
            message={formatArrearsMessage(data.arrears_count)}
            testID="payment-arrears-banner"
          />
        ) : null}

        <View className={`w-full pt-2 ${rowStart}`}>
          <Text
            className={`${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            accessibilityRole="header"
            testID="payment-cycle-list-label"
          >
            {CYCLE_LIST_LABEL}
          </Text>
        </View>

        <View className="w-full gap-2.5" testID="payment-cycle-list">
          {newestFirst.map((cycle) => (
            <CycleRow
              key={cycle.index}
              role="student"
              status={CYCLE_STATUS_VARIANT[cycle.status]}
              title={formatCycleTitle(cycle)}
              subtitle={formatCycleSubtitle(cycle)}
              testID={`payment-cycle-row-${cycle.index}`}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1" testID="payment-screen">
      <TopBar
        title={PAYMENT_SCREEN_TITLE}
        back={false}
        testID="payment-top-bar"
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {body}
      </ScrollView>
    </View>
  );
}
