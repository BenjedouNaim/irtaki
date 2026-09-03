import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner, Icon, TopBar } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';
import { formatArabicMonthYear, formatGender } from '@/shared/utils/format';
import { PerformanceSection } from '@/features/performance/components/PerformanceSection';
import { ProgressSection } from '@/features/progress/components/ProgressSection';

export interface IndividualPerformanceScreenProps {
  /** The membership the roster row carried — API-039's guarded path id. */
  membershipId: string;
  /** The student's name as SCR-23 showed it; names the screen. */
  studentName?: string | null;
  /** `users.gender` of that roster row, for Figma's meta line. */
  gender?: string | null;
  /** The group the row came from, for Figma's meta line. */
  groupName?: string | null;
  /** `memberships.started_at` — "عضو منذ ماي 2026". */
  startedAt?: string | null;
  /** Raw-report link → SCR-25 (F-DR-06); omitted, the row is not rendered. */
  onOpenRawReports?: () => void;
}

/** Figma 38:275 — the immutability reminder (UF §17 read-only staff view). */
const READ_ONLY_NOTICE = 'للقراءة فقط — لا تقييم ولا تعليقات ولا تصحيح.';

/**
 * SCR-24 Individual Performance (Figma 38:160; F-PERF-03, UF §27/§28 "Same
 * layout as Progress Tab"): the Teacher's or Admin's read-only view of one
 * student's dashboard.
 *
 * It adds NO new component — UF §28 gives it the Progress Tab's layout, so
 * it is SCR-13's own `PerformanceSection` wrapped around F-PRG-02's
 * `ProgressSection`, both pointed at the membership routes (API-039 /
 * API-042) instead of the `/me` ones. Around them sit the frame's own
 * chrome: the student's name in the TopBar, the meta line the roster row
 * already knows, the link into SCR-25 and the read-only banner.
 *
 * The frame's AtRiskBadge is not rendered: it belongs to the at-risk
 * endpoint (API-040, F-PERF-04), which does not exist yet, and UF §17 is
 * explicit that at-risk is "never inferred from a low score alone".
 */
export function IndividualPerformanceScreen({
  membershipId,
  studentName,
  gender,
  groupName,
  startedAt,
  onOpenRawReports,
}: IndividualPerformanceScreenProps) {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/teacher');
    }
  };

  // Figma 38:197 "ذكر · حلقة الفجر · عضو منذ ماي 2026" — assembled from what
  // the roster row carried; a part the row did not have is simply left out
  // rather than guessed (UF §8).
  const meta = [
    formatGender(gender),
    groupName || null,
    startedAt ? `عضو منذ ${formatArabicMonthYear(startedAt)}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="individual-performance-screen"
    >
      <TopBar
        title={studentName || 'أداء الطالب'}
        onBack={goBack}
        testID="individual-performance-top-bar"
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {meta ? (
          <Text
            testID="individual-performance-meta"
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            {meta}
          </Text>
        ) : null}

        {/* SCR-13's own section, wrapped around SCR-13's own memorization
            card — Figma 38:160 keeps the same order: selector · score ·
            memorization · breakdown · tiles · days-since. */}
        <PerformanceSection membershipId={membershipId}>
          <ProgressSection membershipId={membershipId} />
        </PerformanceSection>

        {onOpenRawReports ? (
          <Pressable
            testID="raw-reports-button"
            onPress={onOpenRawReports}
            accessibilityRole="button"
            accessibilityLabel="عرض التقارير الخام"
            className={`w-full ${rowStart} items-center justify-between gap-3 px-5 py-4 min-h-[56px] rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark active:opacity-80`}
            style={{ borderCurve: 'continuous' }}
          >
            <View className={`${rowStart} items-center gap-2.5`}>
              <Icon name="history" size={20} tone="brand" />
              <Text
                className={`${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
              >
                عرض التقارير الخام
              </Text>
            </View>
            <Icon name="chevron-left" size={20} tone="tertiary" />
          </Pressable>
        ) : null}

        <Banner
          tone="info"
          message={READ_ONLY_NOTICE}
          testID="individual-performance-readonly"
        />
      </ScrollView>
    </View>
  );
}
