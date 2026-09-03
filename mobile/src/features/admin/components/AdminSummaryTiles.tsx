import React from 'react';
import { View } from 'react-native';
import { MetricTile } from '@/shared/components';
import { rowStart } from '@/shared/theme/rtl';

export interface AdminSummaryTilesProps {
  /** `group_count` — `GET /me/dashboard`, Admin payload (API-009, UF §10). */
  groupCount?: number | null;
  /** `staff_count` — Teachers + Assistants. */
  staffCount?: number | null;
  /** `student_count` — across every group. */
  studentCount?: number | null;
  /** `pending_recovery_count` — informational, reached via Group → Roster. */
  pendingRecoveryCount?: number | null;
  testID?: string;
}

/**
 * SCR-26's tile block (Figma 39:36): the four Admin dashboard counts as a
 * 2-up MetricTile grid, first tile rightmost (UF §31). The counts come from
 * `GET /me/dashboard`'s Admin payload (APIS §10.3), which has no client yet —
 * every tile therefore renders MetricTile's documented Null state (em-dash +
 * "بيانات غير كافية") rather than a fabricated number (DEC-B04). Passing the
 * counts in is all that is needed once the dashboard call exists.
 *
 * The groups tile carries no caption: the frame's "4 نشطة · 1 مؤرشفة" splits
 * `group_count` by lifecycle state, which the Admin payload does not carry.
 */
export function AdminSummaryTiles({
  groupCount = null,
  staffCount = null,
  studentCount = null,
  pendingRecoveryCount = null,
  testID = 'admin-summary-tiles',
}: AdminSummaryTilesProps) {
  return (
    <View className="w-full gap-2.5" testID={testID}>
      <View className={`${rowStart} gap-2.5 w-full`}>
        <MetricTile
          label="المجموعات"
          value={groupCount}
          testID={`${testID}-groups`}
        />
        <MetricTile
          label="أعضاء الطاقم"
          value={staffCount}
          caption="معلّمون ومساعدون"
          testID={`${testID}-staff`}
        />
      </View>
      <View className={`${rowStart} gap-2.5 w-full`}>
        <MetricTile
          label="الطلاب"
          value={studentCount}
          caption="عبر كل المجموعات"
          testID={`${testID}-students`}
        />
        <MetricTile
          label="استرجاعات معلّقة"
          value={pendingRecoveryCount}
          caption="عبر قوائم المجموعات"
          testID={`${testID}-recoveries`}
        />
      </View>
    </View>
  );
}
