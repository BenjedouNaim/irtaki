import React from 'react';
import { View } from 'react-native';
import { MetricTile } from '@/shared/components/MetricTile';
import { rowStart } from '@/shared/theme/rtl';

export interface AssistantSummaryTilesProps {
  /** `pending_request_count` — API-009's Assistant payload. */
  pendingRequestCount: number;
  /** Sum of `groups[].payment_followup_count` across the assigned groups. */
  paymentFollowUpCount: number;
  /** UF §10 "Pending request count → Join Requests tab". */
  onOpenJoinRequests?: () => void;
  /** UF §10 "payment_followup_count → filtered Payments view". */
  onOpenPayments?: () => void;
  testID?: string;
}

/** Figma 34:36's captions. */
const PENDING_LABEL = 'طلبات معلّقة';
const PENDING_CAPTION = 'مرتّبة حسب النقاط';
const FOLLOW_UP_LABEL = 'متابعات الدفع';
/** Figma writes "عبر المجموعتين"; the count-neutral form fits any roster. */
const FOLLOW_UP_CAPTION = 'عبر مجموعاتك';

/**
 * SCR-17's two summary tiles (Figma 34:36), both read off the ONE
 * `GET /me/dashboard` call: the size of the review queue and the total
 * payment follow-ups across the assigned groups (UF §10).
 *
 * The pending tile is rightmost (UF §31, first child at the reading start),
 * matching the frame. Both counts are real numbers, so `0` renders as `0` —
 * MetricTile's null state is for an *undefined* figure, and neither of these
 * ever is (DEC-B04 cuts the other way here).
 *
 * There is no third tile, and no disabled one: DEC-B09 excludes the
 * Assistant from every performance figure, and UF §10 requires that
 * exclusion to be invisible rather than "a visible tease". The payload this
 * screen reads cannot even carry such a figure (see `dashboard.client.ts`).
 */
export function AssistantSummaryTiles({
  pendingRequestCount,
  paymentFollowUpCount,
  onOpenJoinRequests,
  onOpenPayments,
  testID = 'assistant-summary-tiles',
}: AssistantSummaryTilesProps) {
  return (
    <View className={`w-full ${rowStart} gap-3 items-stretch`} testID={testID}>
      <MetricTile
        label={PENDING_LABEL}
        value={pendingRequestCount}
        caption={PENDING_CAPTION}
        onPress={onOpenJoinRequests}
        testID={`${testID}-pending`}
      />
      <MetricTile
        label={FOLLOW_UP_LABEL}
        value={paymentFollowUpCount}
        caption={FOLLOW_UP_CAPTION}
        onPress={onOpenPayments}
        testID={`${testID}-follow-ups`}
      />
    </View>
  );
}
