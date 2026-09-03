import React, { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Banner } from '@/shared/components/Banner';
import { Chip } from '@/shared/components/Chip';
import { CYCLE_STATUS_BADGE } from '@/shared/components/CycleRow';
import { EmptyState } from '@/shared/components/EmptyState';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { TopBar } from '@/shared/components/TopBar';
import { AssistantTabBar } from '@/navigation/AssistantTabBar';
import { ApiError } from '@/shared/api/types';
import { rowStart } from '@/shared/theme/rtl';
import { useAssignedGroups } from '@/features/groups/hooks/useAssignedGroups';
import {
  GroupPaymentsFilter,
  useGroupPayments,
} from '../hooks/useGroupPayments';
import { GroupLedgerSelector } from '../components/GroupLedgerSelector';
import { StudentLedgerRow } from '../components/StudentLedgerRow';
import { formatGroupLedgerSummary } from '../utils/paymentCopy';

export const PAYMENTS_LEDGER_TITLE = 'المدفوعات';
/** Figma 36:448 — the "All" chip, i.e. no `?status=` at all (APIS §9.3). */
export const ALL_FILTER_LABEL = 'الكل';

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل سجلّ المدفوعات';
/** UF §23 — the same line Assistant Home shows when nothing is assigned. */
const NO_GROUPS_MESSAGE =
  'لم تُسند إليك أي مجموعة بعد — الإسناد من صلاحيات المدير';
/** UF §18 empty states. */
export const NO_STUDENTS_MESSAGE = 'لا طلاب في هذه المجموعة';
export const NO_STUDENTS_WITH_STATUS_MESSAGE = 'لا طلاب بهذه الحالة';

/**
 * The chips of Figma 36:440, in reading order: All first (rightmost under
 * RTL), then the three SRS statuses. Their labels are the badge labels of
 * the shared CycleRow map, so a chip and the row badge it selects can never
 * drift apart. There is no fourth chip — arrears are a count, not a status
 * (BR-55).
 */
export const LEDGER_FILTERS: Array<{
  key: string;
  label: string;
  status: GroupPaymentsFilter;
}> = [
  { key: 'all', label: ALL_FILTER_LABEL, status: undefined },
  { key: 'paid', label: CYCLE_STATUS_BADGE.paid.label, status: 'Paid' },
  {
    key: 'due-soon',
    label: CYCLE_STATUS_BADGE.dueSoon.label,
    status: 'Due Soon',
  },
  { key: 'unpaid', label: CYCLE_STATUS_BADGE.unpaid.label, status: 'Unpaid' },
];

/**
 * Maps a query error to the user-facing Arabic message per UF §24's table:
 * network and `5xx` → generic retry copy, the server string never shown;
 * any remaining `4xx` carries the exception filter's Arabic message. `401`
 * is refreshed silently by the API client and never reaches here.
 */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.statusCode >= 500
      ? SERVER_ERROR_MESSAGE
      : error.message || SERVER_ERROR_MESSAGE;
  }
  return NETWORK_ERROR_MESSAGE;
}

/**
 * SCR-20 Payments Ledger (F-PAY-02, UF §18; Figma 36:401 and the filtered
 * empty state 53:747): the group selector, the four status chips and one
 * row per student carrying their current-cycle badge and, when they have
 * any, an arrears badge.
 *
 * Everything is derived server-side by DS-06 (ADR-006) and rendered as
 * returned — including the filter, which is `GET /groups/{id}/payments?status=`
 * (API-046, FR-PAY-06) rather than a client-side pass over the list. The
 * group summary reads the unfiltered slice, so it keeps reporting the whole
 * group while a filter narrows the rows, exactly as 53:747 shows.
 *
 * There is no "Mark as Paid" action and no push into SCR-21 Payment Detail:
 * both belong to F-PAY-03 / API-047, which does not exist yet.
 */
export function PaymentsLedgerScreen() {
  const [status, setStatus] = useState<GroupPaymentsFilter>(undefined);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const groupsQuery = useAssignedGroups();
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const groupId = selectedGroupId ?? groups[0]?.id ?? null;
  const group = groups.find((item) => item.id === groupId) ?? null;

  // The whole group, for the selector's summary — 53:747 keeps showing it
  // while a filter empties the list below. With no filter this is the very
  // same query key as the list, so it costs no extra request.
  const summaryQuery = useGroupPayments(groupId, undefined);
  const ledgerQuery = useGroupPayments(groupId, status);

  const summary = summaryQuery.data
    ? formatGroupLedgerSummary(
        summaryQuery.data.length,
        summaryQuery.data.filter((entry) => entry.arrears_count > 0).length,
      )
    : null;

  const isLoading =
    groupsQuery.isLoading || (Boolean(groupId) && ledgerQuery.isLoading);
  const error = groupsQuery.error ?? ledgerQuery.error;
  const isError = groupsQuery.isError || ledgerQuery.isError;

  let body: React.ReactElement;

  if (isLoading) {
    // UF §22: the skeleton matches the layout it replaces — the selector
    // card, the chip row and the ledger rows.
    body = (
      <View className="w-full gap-3.5" testID="payments-ledger-skeleton">
        <SkeletonLoader
          variant="row"
          count={1}
          testID="payments-ledger-skeleton-selector"
        />
        <SkeletonLoader
          variant="row"
          count={4}
          testID="payments-ledger-skeleton-rows"
        />
      </View>
    );
  } else if (isError) {
    body = (
      <Banner
        tone="error"
        message={describeError(error)}
        onRetry={() => {
          void groupsQuery.refetch();
          void ledgerQuery.refetch();
        }}
        testID="payments-ledger-error"
      />
    );
  } else if (groups.length === 0) {
    body = (
      <EmptyState
        message={NO_GROUPS_MESSAGE}
        icon="layers"
        testID="payments-ledger-no-groups"
      />
    );
  } else {
    const ledgers = ledgerQuery.data ?? [];
    body = (
      <View className="w-full gap-3.5" testID="payments-ledger-content">
        <GroupLedgerSelector
          group={group}
          groups={groups}
          summary={summary}
          onSelect={setSelectedGroupId}
        />

        <View
          className={`${rowStart} items-start gap-2 w-full`}
          accessibilityRole="radiogroup"
          testID="payments-ledger-filters"
        >
          {LEDGER_FILTERS.map((filter) => (
            <Chip
              key={filter.key}
              type="filter"
              label={filter.label}
              selected={status === filter.status}
              onPress={() => setStatus(filter.status)}
              testID={`payments-ledger-filter-${filter.key}`}
            />
          ))}
        </View>

        {ledgers.length === 0 ? (
          <EmptyState
            message={
              status ? NO_STUDENTS_WITH_STATUS_MESSAGE : NO_STUDENTS_MESSAGE
            }
            icon="users"
            testID="payments-ledger-empty"
          />
        ) : (
          <View className="w-full gap-2.5" testID="payments-ledger-list">
            {ledgers.map((ledger) => (
              <StudentLedgerRow key={ledger.membership_id} ledger={ledger} />
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="payments-ledger-screen"
    >
      <TopBar
        title={PAYMENTS_LEDGER_TITLE}
        back={false}
        testID="payments-ledger-top-bar"
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
      <AssistantTabBar activeKey="payments" />
    </View>
  );
}
