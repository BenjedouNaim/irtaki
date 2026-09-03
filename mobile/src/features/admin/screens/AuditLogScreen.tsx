import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Chip, ReportHistoryList, TopBar } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';
import { AuditEntry } from '@/shared/api/audit.client';
import { AuditEntryRow } from '../components/AuditEntryRow';
import { AuditActionFilter, useAuditLog } from '../hooks/useAuditLog';
import { AUDIT_ACTION_LABELS } from '../utils/auditEntry';

/**
 * Figma ActionFilter (42:597), first chip rightmost (UF §31). "الكل" drops
 * the `action` param; the other three are APIS §9.3's `action` filter, and
 * there is no fourth chip because there is no fourth audited action
 * (APIS §9.9, RISK-08).
 */
const FILTERS: { key: AuditActionFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'LOGIN', label: AUDIT_ACTION_LABELS.LOGIN },
  { key: 'GROUP_CREATED', label: AUDIT_ACTION_LABELS.GROUP_CREATED },
  { key: 'ENROLLMENT_TOGGLED', label: AUDIT_ACTION_LABELS.ENROLLMENT_TOGGLED },
];

/** UF §24 — 5xx and network never show the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل سجل التدقيق';

/**
 * SCR-33 Audit Log (Figma 42:566) — F-ADM-03. A flat chronological list
 * (UF §28) of the audit entries API-054 returns, `occurred_at DESC`
 * (APIS §9.4), cursor-paginated as infinite scroll (APIS §9.2), narrowed by
 * the action chips. Read-only: the log has no row action and no detail
 * screen (UF §26 gives it no destination), and nothing on this screen
 * writes an entry — the three write points live on the endpoints that
 * perform the audited actions.
 *
 * The header line states the boundary the frame states: exactly three
 * actions are recorded, newest first.
 */
export function AuditLogScreen() {
  const [filter, setFilter] = useState<AuditActionFilter>('all');
  const query = useAuditLog(filter);

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="audit-log-screen"
    >
      <TopBar title="سجل التدقيق" testID="audit-log-top-bar" />

      <View className="flex-1 px-4 pt-1 pb-6 gap-3">
        <View
          className={`${rowStart} items-center justify-between w-full`}
          testID="audit-log-head"
        >
          <Text
            className={`${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            maxFontSizeMultiplier={1.6}
            testID="audit-log-scope"
          >
            3 إجراءات مسجّلة فقط
          </Text>
          <Text
            className={`${typography.caption} text-fg-tertiary dark:text-fg-tertiary-dark`}
            maxFontSizeMultiplier={1.6}
            testID="audit-log-order"
          >
            الأحدث أولًا
          </Text>
        </View>

        <View
          className={`${rowStart} items-start gap-2 w-full flex-wrap`}
          testID="audit-log-action-filter"
        >
          {FILTERS.map((option) => (
            <Chip
              key={option.key}
              type="filter"
              label={option.label}
              selected={filter === option.key}
              onPress={() => setFilter(option.key)}
              testID={`audit-filter-${option.key}`}
            />
          ))}
        </View>

        <ReportHistoryList<AuditEntry>
          query={query}
          renderRow={(entry) => <AuditEntryRow entry={entry} />}
          emptyMessage={
            filter === 'all'
              ? 'لا إجراءات مسجّلة بعد'
              : 'لا إجراءات من هذا النوع بعد'
          }
          emptyIcon="history"
          skeletonVariant="row"
          serverErrorMessage={SERVER_ERROR_MESSAGE}
          grouped
          testID="audit-log-list"
        />
      </View>
    </View>
  );
}
