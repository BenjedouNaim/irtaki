import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  TopBar,
  Banner,
  Icon,
  ListRow,
  EmptyState,
  StatusBadge,
  SkeletonLoader,
} from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import {
  getGroupMemberships,
  RosterEntry,
} from '@/shared/api/memberships.client';
import { getGroupDetail, GroupListItemFull } from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';
import { EnrollmentToggle } from '@/features/groups/components/EnrollmentToggle';
import { getRecitationDayName } from '@/features/joinRequests/screens/JoinStepperScreen';
import {
  formatArabicCount,
  formatArabicDate,
  formatGender,
  STUDENT_COUNT_FORMS,
} from '@/shared/utils/format';

export interface RosterScreenProps {
  groupId: string;
  /**
   * `admin` (default): SCR-30 Roster · Admin (Figma 41:316) — current and
   * removed members, removed rows open SCR-31.
   * `teacher`: SCR-23 Group Detail · Teacher (Figma 37:124) — the group
   * header, the enrollment toggle and the student list; the screen also
   * loads the group itself (`GET /groups/{id}`, Teacher (g)).
   */
  variant?: 'admin' | 'teacher';
  /** Admin: the group name carried by the route for the list head. */
  groupName?: string | null;
  /**
   * Active row tap. The Teacher's student list (SCR-23 roster portion)
   * passes the way into that student's raw daily reports (SCR-25, F-DR-06);
   * without it Active rows are not tappable (Admin's SCR-30).
   */
  onActiveMemberPress?: (entry: RosterEntry) => void;
  /**
   * Whether a Terminated row opens the Admin recovery view (SCR-31). Roles
   * without that route must pass `false` — navigation never offers an
   * out-of-scope screen (UF §8).
   */
  canOpenRecovery?: boolean;
}

const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** UF §23 — factual, no CTA. */
const EMPTY_MESSAGE = 'لا طلاب في هذه المجموعة بعد';

function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.message || fallback;
  }
  return NETWORK_ERROR_MESSAGE;
}

function initialOf(name: string | null): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed.charAt(0) : '؟';
}

export default function RosterScreen({
  groupId,
  variant = 'admin',
  groupName,
  onActiveMemberPress,
  canOpenRecovery = true,
}: RosterScreenProps) {
  const router = useRouter();
  const isTeacher = variant === 'teacher';
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [group, setGroup] = useState<GroupListItemFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchRoster = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [rosterResponse, groupResponse] = await Promise.all([
        getGroupMemberships(groupId),
        isTeacher ? getGroupDetail(groupId) : Promise.resolve(null),
      ]);
      setEntries(rosterResponse.data);
      if (groupResponse) {
        setGroup(groupResponse.data as GroupListItemFull);
      }
    } catch (err) {
      setErrorMessage(describeError(err, 'تعذر تحميل قائمة الطلاب'));
    } finally {
      setIsLoading(false);
    }
  }, [groupId, isTeacher]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const isRowPressable = (item: RosterEntry) =>
    item.state === 'Terminated'
      ? canOpenRecovery
      : Boolean(onActiveMemberPress);

  const handleRowPress = (item: RosterEntry) => {
    if (item.state === 'Terminated') {
      if (canOpenRecovery) {
        router.push({
          pathname: '/(app)/admin/memberships/[id]/recovery' as any,
          params: { id: item.id },
        });
      }
      return;
    }
    onActiveMemberPress?.(item);
  };

  const active = entries.filter((e) => e.state === 'Active');
  const removed = entries.filter((e) => e.state === 'Terminated');

  const renderTeacherRow = (item: RosterEntry) => {
    const name = item.user.full_name || 'غير محدد';
    const terminated = item.state === 'Terminated';
    const pressable = isRowPressable(item);
    return (
      <Pressable
        key={item.id}
        testID={`roster-row-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={terminated ? `${name}، مُزال` : name}
        accessibilityState={{ disabled: !pressable }}
        disabled={!pressable}
        onPress={() => handleRowPress(item)}
        className={`${rowStart} items-center gap-2.5 w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-3.5 py-3 active:opacity-80 ${
          terminated ? 'opacity-85' : ''
        }`}
        style={{ borderCurve: 'continuous' }}
      >
        <View className="w-9 h-9 rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center">
          <Text
            className={`${typography.labelMd} text-center text-fg-secondary dark:text-fg-secondary-dark`}
            maxFontSizeMultiplier={1.4}
          >
            {initialOf(item.user.full_name)}
          </Text>
        </View>
        <View className={`flex-1 gap-1 ${itemsStart}`}>
          <Text
            selectable
            numberOfLines={1}
            className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
          >
            {name}
          </Text>
          {/* Meta slot — the "days since last report" / at-risk line needs
              the performance module (not built); the score slot before the
              chevron is reserved for the same reason. */}
        </View>
        {terminated ? (
          <StatusBadge
            status="مُزال"
            variant="neutral"
            testID={`roster-state-badge-${item.id}`}
          />
        ) : (
          <Icon name="chevron-left" size={18} tone="tertiary" />
        )}
      </Pressable>
    );
  };

  const renderAdminRow = (item: RosterEntry) => {
    const name = item.user.full_name || 'غير محدد';
    const terminated = item.state === 'Terminated';
    const gender = formatGender(item.user.gender);
    const since = formatArabicDate(item.started_at);
    const subtitle = terminated
      ? `${gender ? `${gender} · ` : ''}انضم في ${since}`
      : `${gender ? `${gender} · ` : ''}منذ ${since}`;
    return (
      <ListRow
        key={item.id}
        title={name}
        subtitle={subtitle}
        leadingIcon="user"
        trailing="badge"
        badge={
          terminated
            ? { status: 'مُزال', variant: 'neutral' }
            : { status: 'نشط', variant: 'success' }
        }
        onPress={isRowPressable(item) ? () => handleRowPress(item) : undefined}
        testID={`roster-row-${item.id}`}
        className={terminated ? 'opacity-85' : ''}
      />
    );
  };

  let body: React.ReactElement;
  if (isLoading) {
    body = (
      <SkeletonLoader
        variant="row"
        count={4}
        testID="roster-skeleton"
        className="pt-1"
      />
    );
  } else if (errorMessage) {
    body = (
      <Banner
        tone="error"
        message={errorMessage}
        onRetry={fetchRoster}
        testID="roster-error"
      />
    );
  } else if (isTeacher) {
    body = (
      <>
        {group ? (
          <>
            <View className={`${rowStart} items-center justify-between w-full`}>
              <Text
                className={`${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                testID="roster-group-meta"
              >
                {`${getRecitationDayName(group.recitation_day)} · ${formatArabicCount(
                  active.length,
                  STUDENT_COUNT_FORMS,
                )}`}
              </Text>
              <StatusBadge
                status={group.lifecycle_state === 'Active' ? 'نشطة' : 'مؤرشفة'}
                variant={
                  group.lifecycle_state === 'Active' ? 'success' : 'neutral'
                }
                testID="roster-lifecycle-badge"
              />
            </View>
            <EnrollmentToggle
              groupId={groupId}
              enrollmentStatus={group.enrollment_status}
              onToggled={(newStatus) =>
                setGroup((prev) =>
                  prev ? { ...prev, enrollment_status: newStatus } : prev,
                )
              }
            />
          </>
        ) : null}

        <View className={`${rowStart} items-center pt-1.5 w-full`}>
          <Text
            className={`${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            الطلاب
          </Text>
        </View>

        {entries.length === 0 ? (
          <EmptyState
            icon="users"
            message={EMPTY_MESSAGE}
            testID="roster-empty"
          />
        ) : (
          <View className="w-full gap-2" testID="roster-list">
            {active.map(renderTeacherRow)}
            {removed.map(renderTeacherRow)}
          </View>
        )}
      </>
    );
  } else {
    body = (
      <>
        <View className={`${rowStart} items-center justify-between w-full`}>
          <Text
            className={`${typography.headingSm} text-right text-fg dark:text-fg-dark`}
            testID="roster-head"
          >
            {groupName
              ? `${groupName} · ${active.length} حاليًا`
              : `${active.length} حاليًا`}
          </Text>
          <Text
            className={`${typography.caption} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
          >
            الاسم والجنس فقط
          </Text>
        </View>

        {entries.length === 0 ? (
          <EmptyState
            icon="users"
            message={EMPTY_MESSAGE}
            testID="roster-empty"
          />
        ) : (
          <View className="w-full gap-2" testID="roster-list">
            {active.map(renderAdminRow)}
            {removed.length > 0 ? (
              <>
                <View className={`${rowStart} items-center pt-2 w-full`}>
                  <Text
                    className={`${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                    testID="roster-removed-label"
                  >
                    مُزالون — قابلون للاسترجاع للقراءة
                  </Text>
                </View>
                {removed.map(renderAdminRow)}
              </>
            ) : null}
          </View>
        )}
      </>
    );
  }

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="roster-screen"
    >
      <TopBar
        title={isTeacher ? (group?.name ?? '') : 'قائمة الطلاب'}
        testID="roster-top-bar"
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {body}
      </ScrollView>
    </View>
  );
}
