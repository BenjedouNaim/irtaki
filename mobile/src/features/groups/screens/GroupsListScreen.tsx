import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  TopBar,
  Button,
  Banner,
  Chip,
  Icon,
  ListRow,
  EmptyState,
  SkeletonLoader,
  StatusBadgeVariant,
} from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { useThemeColors } from '@/shared/theme/colors';
import { rowStart } from '@/shared/theme/rtl';
import { listGroups, GroupListItemFull } from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';
import { getRecitationDayName } from '@/features/joinRequests/screens/JoinStepperScreen';
import { formatArabicCount, GROUP_COUNT_FORMS } from '@/shared/utils/format';

/** Figma LifecycleFilter chips (51:549), first chip rightmost (UF §31). */
type GroupFilter = 'all' | 'active' | 'closed' | 'archived';

const FILTERS: { key: GroupFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'active', label: 'نشطة' },
  { key: 'closed', label: 'التسجيل مغلق' },
  { key: 'archived', label: 'مؤرشفة' },
];

function matchesFilter(group: GroupListItemFull, filter: GroupFilter) {
  switch (filter) {
    case 'active':
      return group.lifecycle_state === 'Active';
    case 'closed':
      return group.enrollment_status === 'Closed';
    case 'archived':
      return group.lifecycle_state === 'Archived';
    default:
      return true;
  }
}

/** One badge per row: lifecycle first, then a closed enrollment (Figma 39:144). */
function rowBadge(group: GroupListItemFull): {
  status: string;
  variant: StatusBadgeVariant;
} {
  if (group.lifecycle_state === 'Archived') {
    return { status: 'مؤرشفة', variant: 'neutral' };
  }
  if (group.enrollment_status === 'Closed') {
    return { status: 'التسجيل مغلق', variant: 'warning' };
  }
  return { status: 'نشطة', variant: 'success' };
}

function rowSubtitle(group: GroupListItemFull): string {
  const day = getRecitationDayName(group.recitation_day);
  const gender = group.gender === 'Male' ? 'ذكور' : 'إناث';
  const teacher = group.teacher?.full_name;
  const assistant = group.assistant?.full_name;
  const staff =
    teacher && assistant
      ? `${teacher} / ${assistant}`
      : teacher || assistant || '—';
  return `${day} · ${gender} · ${staff}`;
}

/** The add pill is 38px tall; the slop reaches the 48dp target (UF §32). */
const ADD_HIT_SLOP = { top: 5, bottom: 5, left: 4, right: 4 };

/**
 * SCR-27 Groups List · Admin (Figma 39:106; loading 51:558; filtered empty
 * 51:632; network error 51:696). `GET /groups` is unfiltered and sorted
 * `created_at DESC` (APIS §10.4); search and the lifecycle chips narrow the
 * fetched list on the device only.
 */
export function GroupsListScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [groups, setGroups] = useState<GroupListItemFull[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GroupFilter>('all');

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await listGroups();
      setGroups(response.data as GroupListItemFull[]);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذّر تحميل المجموعات.');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return groups.filter(
      (group) =>
        matchesFilter(group, filter) &&
        (needle.length === 0 ||
          group.name.toLocaleLowerCase().includes(needle)),
    );
  }, [groups, filter, query]);

  const triggerHaptic = () => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Fallback
      }
    }
  };

  const handleCreateGroup = () => {
    triggerHaptic();
    router.push('/(app)/admin/groups/create');
  };

  const handleGroupPress = (groupId: string) => {
    triggerHaptic();
    router.push({
      pathname: '/(app)/admin/groups/[id]',
      params: { id: groupId },
    });
  };

  let content: React.ReactElement;
  if (isLoading) {
    content = (
      <View testID="groups-list-skeleton" className="w-full">
        <SkeletonLoader variant="row" count={4} />
      </View>
    );
  } else if (errorMessage) {
    content = (
      <Banner
        tone="error"
        message={errorMessage}
        onRetry={fetchGroups}
        testID="groups-list-error"
      />
    );
  } else if (groups.length === 0) {
    content = (
      <EmptyState
        icon="layers"
        message="لا توجد مجموعات بعد"
        testID="groups-list-empty"
      >
        <Button
          label="مجموعة جديدة"
          variant="outline"
          size="small"
          onPress={handleCreateGroup}
          testID="empty-state-create-button"
          className="mt-1"
        />
      </EmptyState>
    );
  } else if (visibleGroups.length === 0) {
    content = (
      <EmptyState
        icon="layers"
        message="لا توجد مجموعات تطابق البحث"
        testID="groups-list-filtered-empty"
      />
    );
  } else {
    content = (
      <View className="w-full gap-2.5" testID="groups-list-content">
        {visibleGroups.map((group) => (
          <ListRow
            key={group.id}
            title={group.name}
            subtitle={rowSubtitle(group)}
            leadingIcon="layers"
            trailing="badge"
            badge={rowBadge(group)}
            onPress={() => handleGroupPress(group.id)}
            accessibilityLabel={`مجموعة ${group.name}`}
            testID={`group-row-${group.id}`}
            className={group.lifecycle_state === 'Archived' ? 'opacity-70' : ''}
          />
        ))}
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="groups-list-screen"
    >
      <TopBar title="المجموعات" testID="groups-list-top-bar" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Head: count (right) · add pill (left) */}
        <View className={`${rowStart} items-center justify-between w-full`}>
          <Text
            className={`${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID="groups-list-count"
          >
            {isLoading || errorMessage
              ? 'الأحدث أولًا'
              : `${formatArabicCount(groups.length, GROUP_COUNT_FORMS)} · الأحدث أولًا`}
          </Text>
          <Pressable
            onPress={handleCreateGroup}
            hitSlop={ADD_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="مجموعة جديدة"
            testID="create-group-header-button"
            className={`${rowStart} items-center gap-1.5 rounded-full bg-primary dark:bg-primary-dark ps-3 pe-2.5 py-2 active:opacity-90`}
          >
            <Text
              className={`${typography.labelMd} text-right text-fg-on-primary`}
            >
              مجموعة جديدة
            </Text>
            <Icon name="plus" size={16} tone="on-primary" />
          </Pressable>
        </View>

        {/* Search */}
        <View
          className={`${rowStart} items-center gap-2.5 w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-3.5 py-[11px]`}
          style={{ borderCurve: 'continuous' }}
        >
          <Icon name="search" size={18} tone="tertiary" />
          <TextInput
            testID="groups-list-search"
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث باسم المجموعة"
            placeholderTextColor={colors.textTertiary}
            textAlign="right"
            returnKeyType="search"
            accessibilityLabel="ابحث باسم المجموعة"
            className={`flex-1 p-0 ${typography.bodyMd} text-right text-fg dark:text-fg-dark`}
            style={{ lineHeight: undefined }}
          />
        </View>

        {/* Lifecycle filter chips */}
        <View className={`${rowStart} items-start gap-2 w-full flex-wrap`}>
          {FILTERS.map((option) => (
            <Chip
              key={option.key}
              type="filter"
              label={option.label}
              selected={filter === option.key}
              onPress={() => setFilter(option.key)}
              testID={`groups-filter-${option.key}`}
            />
          ))}
        </View>

        {content}
      </ScrollView>
    </View>
  );
}
