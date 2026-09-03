import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName } from './Icon';
import { StatusBadge, StatusBadgeVariant } from './StatusBadge';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

/** Figma ListRow.Trailing — Chevron · Badge · None. */
export type ListRowTrailing = 'chevron' | 'badge' | 'none';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading 40px avatar ring on the right; `null` hides it. */
  leadingIcon?: IconName | null;
  trailing?: ListRowTrailing;
  badge?: { status: string; variant?: StatusBadgeVariant };
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma ListRow (16:34): 72px surface card. Title + optional subtitle
 * right-aligned, optional leading avatar (right), trailing chevron (left,
 * mirrored for RTL) or a StatusBadge. Group / roster / user / discovery rows.
 */
export function ListRow({
  title,
  subtitle,
  leadingIcon = 'user',
  trailing = 'chevron',
  badge,
  onPress,
  disabled = false,
  accessibilityLabel,
  testID = 'list-row',
  className,
  style,
}: ListRowProps) {
  const body = (
    <>
      {leadingIcon ? (
        <View
          testID={`${testID}-leading`}
          className="w-10 h-10 rounded-full bg-primary-subtle dark:bg-primary-subtle-dark items-center justify-center"
        >
          <Icon name={leadingIcon} size={20} tone="brand" />
        </View>
      ) : null}
      <View className={`flex-1 gap-0.5 ${itemsStart}`}>
        <Text
          testID={`${testID}-title`}
          numberOfLines={1}
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            testID={`${testID}-subtitle`}
            numberOfLines={1}
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing === 'chevron' ? (
        <Icon
          name="chevron-left"
          size={20}
          tone="tertiary"
          testID={`${testID}-chevron`}
        />
      ) : trailing === 'badge' && badge ? (
        <StatusBadge
          status={badge.status}
          variant={badge.variant}
          testID={`${testID}-badge`}
        />
      ) : null}
    </>
  );

  const rowClass = `${rowStart} items-center h-[72px] px-4 gap-3 w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${
    className ?? ''
  }`;
  const rowStyle = [{ borderCurve: 'continuous' as const }, style];

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel ?? (subtitle ? `${title}، ${subtitle}` : title)
        }
        accessibilityState={{ disabled }}
        className={`${rowClass} active:opacity-80 ${disabled ? 'opacity-50' : ''}`}
        style={rowStyle}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View testID={testID} className={rowClass} style={rowStyle}>
      {body}
    </View>
  );
}
