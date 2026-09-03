import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner } from '@/shared/components/Banner';
import { Button } from '@/shared/components/Button';
import { EmptyState } from '@/shared/components/EmptyState';
import { Icon } from '@/shared/components/Icon';
import { ListRow } from '@/shared/components/ListRow';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { TopBar } from '@/shared/components/TopBar';
import { typography } from '@/shared/theme/typography';
import { itemsStart } from '@/shared/theme/rtl';
import { AssistantTabBar } from '@/navigation/AssistantTabBar';
import { logoutUser } from '@/shared/api/auth.client';
import type { AssistantDashboardDto } from '@/shared/api/dashboard.client';
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';
import { useMe } from '@/features/dashboard/hooks/useMe';
import { describeDashboardError } from '@/features/dashboard/utils/dashboardCopy';
import { AssistantSummaryTiles } from '@/features/dashboard/components/AssistantSummaryTiles';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';

/** UF §23 "Assistant with no groups — No groups assigned yet". */
const EMPTY_MESSAGE = 'لم تُسند إليك أي مجموعة بعد — الإسناد من صلاحيات المدير';

/** "N assigned groups" with Arabic number agreement. */
export function assignedGroupsLabel(count: number): string {
  if (count === 0) return 'لا مجموعات مُسندة بعد';
  if (count === 1) return 'مجموعة واحدة مُسندة';
  if (count === 2) return 'مجموعتان مُسندتان';
  if (count <= 10) return `${count} مجموعات مُسندة`;
  return `${count} مجموعة مُسندة`;
}

/** The group row's trailing badge, "4 متابعات دفع" (Figma 34:48). */
export function followUpBadgeLabel(count: number): string {
  if (count === 1) return 'متابعة دفع واحدة';
  if (count === 2) return 'متابعتا دفع';
  return `${count} متابعات دفع`;
}

function firstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

/**
 * SCR-17 Assistant Home (Figma 34:2 / 53:697): greeting, the two summary
 * tiles and the assigned groups — all from the ONE `GET /me/dashboard` call
 * (F-DASH-01 / API-009, UF §10 "Every dashboard is one `GET /me/dashboard`
 * call"). The screen's previous `GET /groups` request is gone: the dashboard
 * carries each assigned group's id, name and `payment_followup_count`, so
 * keeping the list call would have fetched the same groups twice.
 *
 * `GET /me` stays — it is the caller's identity for the greeting, not
 * dashboard data, and it is the shared `['me']` cache the Profile screen and
 * SCR-08's header already read, so it costs no extra round trip in practice.
 *
 * Figma's row subtitle ("السبت · 18 طالبًا") is dropped rather than sourced
 * from a second endpoint: neither the recitation day nor a member count is in
 * API-009's Assistant payload, and inventing a call for them would undo the
 * one-round-trip the endpoint exists for. The row instead carries the
 * follow-up StatusBadge the frame puts on it.
 *
 * **No performance figure appears anywhere on this screen** (DEC-B09), and
 * none can: the payload type cannot carry one (`dashboard.client.ts`). UF §10
 * requires the exclusion to be invisible, so the frame's explanatory note
 * about it is deliberately not rendered.
 */
export function AssistantTabs() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { data: me } = useMe();
  const { data, isLoading, isError, error, refetch } =
    useDashboard<AssistantDashboardDto>();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const refreshToken = await getStoredRefreshToken();
      if (refreshToken) {
        await logoutUser(refreshToken);
      }
    } catch {
      // Best effort logout on API failure
    } finally {
      await deleteStoredRefreshToken();
      useAuthStore.getState().clearSession();
      setIsLoggingOut(false);
    }
  };

  const openJoinRequests = () => router.push('/(app)/assistant/join-requests');
  const openPayments = () => router.push('/(app)/assistant/payments');

  const name = firstName(me?.full_name);
  const roleLabel = me?.gender === 'Female' ? 'مساعدة' : 'مساعد';
  const subtitle = data
    ? `${roleLabel} · ${assignedGroupsLabel(data.groups.length)}`
    : roleLabel;

  let content: React.ReactElement;
  if (isLoading && !data) {
    content = (
      <SkeletonLoader variant="dashboard" testID="assistant-home-loading" />
    );
  } else if (isError || !data) {
    content = (
      <Banner
        message={describeDashboardError(error)}
        tone="error"
        onRetry={() => void refetch()}
        testID="assistant-home-error"
      />
    );
  } else {
    const followUpTotal = data.groups.reduce(
      (sum, group) => sum + group.payment_followup_count,
      0,
    );
    content = (
      <>
        <AssistantSummaryTiles
          pendingRequestCount={data.pending_request_count}
          paymentFollowUpCount={followUpTotal}
          onOpenJoinRequests={openJoinRequests}
          onOpenPayments={openPayments}
        />

        {data.groups.length === 0 ? (
          <EmptyState
            message={EMPTY_MESSAGE}
            icon="layers"
            testID="assistant-home-empty"
          />
        ) : (
          <>
            <Text
              className={`w-full pt-2 ${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
              accessibilityRole="header"
            >
              مجموعاتك
            </Text>
            <View className="w-full gap-2.5" testID="assistant-home-groups">
              {data.groups.map((group) => (
                <ListRow
                  key={group.id}
                  title={group.name}
                  leadingIcon="layers"
                  trailing={group.payment_followup_count > 0 ? 'badge' : 'none'}
                  badge={
                    group.payment_followup_count > 0
                      ? {
                          status: followUpBadgeLabel(
                            group.payment_followup_count,
                          ),
                          variant: 'warning',
                        }
                      : undefined
                  }
                  testID={`assistant-group-row-${group.id}`}
                />
              ))}
            </View>
          </>
        )}
      </>
    );
  }

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="assistant-tabs"
    >
      <TopBar
        title="الرئيسية"
        back={false}
        testID="assistant-home-top-bar"
        trailing={
          <Pressable
            testID="profile-button"
            onPress={() => router.push('/(app)/profile')}
            accessibilityRole="button"
            accessibilityLabel="الملف الشخصي"
            hitSlop={4}
            className="w-10 h-10 rounded-full items-center justify-center active:opacity-80"
          >
            <Icon name="user" size={22} tone="primary" />
          </Pressable>
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 4,
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 16,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className={`w-full gap-0.5 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
            accessibilityRole="header"
            testID="assistant-home-greeting"
          >
            {name ? `مرحبًا، ${name}` : 'مرحبًا'}
          </Text>
          <Text
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID="assistant-home-subtitle"
          >
            {subtitle}
          </Text>
        </View>

        {content}

        <Button
          label="تسجيل الخروج"
          variant="ghost"
          loading={isLoggingOut}
          onPress={handleLogout}
          testID="logout-button"
          className="w-full"
        />
      </ScrollView>

      <AssistantTabBar activeKey="home" />
    </View>
  );
}
