import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Icon } from '@/shared/components/Icon';
import { SkeletonBlock } from '@/shared/components/SkeletonRow';
import {
  ARABIC_WEEKDAYS,
  greetingForHour,
} from '@/features/dailyReports/utils/arabicDate';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { useMe } from '../hooks/useMe';
import { useMyMembership } from '../hooks/useMyMembership';

export interface HomeHeaderProps {
  /** Avatar tap → SCR-34 Profile/Account. */
  onOpenProfile: () => void;
  /** Injected for deterministic greetings in specs; defaults to now. */
  now?: () => Date;
  testID?: string;
}

/** "حلقة الفجر · يوم التسميع: السبت" (Figma 24:26). */
export function describeMembership(
  groupName: string,
  recitationDay: number,
): string {
  const day = ARABIC_WEEKDAYS[recitationDay];
  return day ? `${groupName} · يوم التسميع: ${day}` : groupName;
}

/**
 * SCR-08 greeting header (Figma 24:21): a 40px primary-subtle avatar with
 * the name's initial (right, opens the profile) and, on the reading side,
 * "صباح الخير، خليل" over the group + recitation day line. Name from
 * `GET /me`, group from `GET /memberships/mine`; each line simply stays
 * empty while its source is unavailable — the Daily CTA already states any
 * membership problem (API-029 `block_reason`).
 */
export function HomeHeader({
  onOpenProfile,
  now = () => new Date(),
  testID = 'home-header',
}: HomeHeaderProps) {
  const me = useMe();
  const membership = useMyMembership();

  const loading =
    (me.isLoading && !me.data) || (membership.isLoading && !membership.data);

  if (loading) {
    return (
      <View
        testID={`${testID}-skeleton`}
        accessibilityLabel="جارٍ التحميل"
        className={`w-full ${rowStart} items-center justify-between gap-3`}
      >
        <SkeletonBlock tone="subtle" className="w-10 h-10 rounded-full" />
        <View className={`gap-2 ${itemsStart}`}>
          <SkeletonBlock className="w-40 h-4 rounded-[8px]" />
          <SkeletonBlock
            tone="subtle"
            className="w-[120px] h-2.5 rounded-[5px]"
          />
        </View>
      </View>
    );
  }

  const fullName = me.data?.full_name?.trim() || null;
  const firstName = fullName?.split(/\s+/)[0] ?? null;
  const initial = fullName ? Array.from(fullName)[0] : null;
  const greeting = greetingForHour(now().getHours());
  const group = membership.data?.group;

  return (
    <View
      testID={testID}
      className={`w-full ${rowStart} items-center justify-between gap-3`}
    >
      <Pressable
        testID="profile-button"
        onPress={onOpenProfile}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="الملف الشخصي"
        className="w-10 h-10 rounded-full bg-primary-subtle dark:bg-primary-subtle-dark items-center justify-center active:opacity-80"
      >
        {initial ? (
          <Text
            testID={`${testID}-initial`}
            className={`${typography.labelLg} text-center text-brand dark:text-brand-dark`}
            maxFontSizeMultiplier={1.3}
          >
            {initial}
          </Text>
        ) : (
          <Icon name="user" size={20} tone="brand" />
        )}
      </Pressable>

      <View className={`flex-1 ${itemsStart}`}>
        <Text
          testID={`${testID}-greeting`}
          numberOfLines={1}
          className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
          accessibilityRole="header"
        >
          {firstName ? `${greeting}، ${firstName}` : greeting}
        </Text>
        {group ? (
          <Text
            testID={`${testID}-membership`}
            numberOfLines={1}
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            {describeMembership(group.name, group.recitation_day)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
