import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Icon } from '@/shared/components/Icon';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { JoinRequestQueueItem } from '@/shared/api/joinRequests.client';

export interface JoinRequestQueueRowProps {
  item: JoinRequestQueueItem;
  onPress?: (id: string) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toISOString().split('T')[0];
  } catch {
    return isoString;
  }
}

/** First letter of the applicant's name for the avatar ring. */
export function nameInitial(fullName: string): string {
  return fullName.trim().charAt(0);
}

/**
 * Figma SCR-18 queue row (34:147): avatar initial (right), name + secondary
 * line, score box (primary-subtle) and a trailing chevron (left). The list
 * API returns name, score and submission date only, so the secondary line
 * carries the date.
 */
export function JoinRequestQueueRow({
  item,
  onPress,
  testID,
  style,
}: JoinRequestQueueRowProps) {
  const rowTestId = testID || `join-request-row-${item.id}`;

  return (
    <Pressable
      testID={rowTestId}
      accessibilityRole="button"
      accessibilityLabel={`طلب انضمام ${item.full_name}، النقاط ${item.score}`}
      onPress={() => onPress?.(item.id)}
      className={`${rowStart} items-center w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-4 py-3.5 gap-3 active:opacity-80`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="w-10 h-10 rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center">
        <Text
          className={`${typography.labelLg} text-center text-fg-secondary dark:text-fg-secondary-dark`}
          maxFontSizeMultiplier={1.3}
        >
          {nameInitial(item.full_name)}
        </Text>
      </View>

      <View className={`flex-1 gap-0.5 ${itemsStart}`}>
        <Text
          numberOfLines={1}
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
          testID={`join-request-name-${item.id}`}
        >
          {item.full_name}
        </Text>
        <Text
          numberOfLines={1}
          className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          testID={`join-request-created-at-${item.id}`}
        >
          {`قُدِّم في ${formatDate(item.created_at)}`}
        </Text>
      </View>

      <View
        className="items-center rounded-sm bg-primary-subtle dark:bg-primary-subtle-dark px-2.5 py-1"
        style={{ borderCurve: 'continuous' }}
        testID={`join-request-score-container-${item.id}`}
      >
        <Text
          className={`${typography.headingSm} text-center text-brand dark:text-brand-dark`}
          style={{ fontVariant: ['tabular-nums'] }}
          testID={`join-request-score-${item.id}`}
          maxFontSizeMultiplier={1.5}
        >
          {item.score}
        </Text>
        <Text
          className={`${typography.caption} text-center text-brand dark:text-brand-dark`}
          maxFontSizeMultiplier={1.5}
        >
          النقاط
        </Text>
      </View>

      <Icon name="chevron-left" size={18} tone="tertiary" />
    </Pressable>
  );
}
