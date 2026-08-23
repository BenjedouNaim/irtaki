import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { StatusBadge } from '@/shared/components/StatusBadge';
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
      accessibilityLabel={`طلب انضمام ${item.full_name}`}
      onPress={() => onPress?.(item.id)}
      className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 active:border-primary dark:active:border-primary-500 gap-3"
      style={[{ borderCurve: 'continuous' }, style]}
    >
      {/* Top row: Name & Score */}
      <View className="flex-row-reverse items-center justify-between gap-2">
        <Text
          selectable
          className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right flex-1"
          testID={`join-request-name-${item.id}`}
        >
          {item.full_name}
        </Text>
        <View
          className="flex-row-reverse items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-950/60 border border-primary-200 dark:border-primary-800"
          style={{ borderCurve: 'continuous' }}
          testID={`join-request-score-container-${item.id}`}
        >
          <Text className="text-xs text-primary-700 dark:text-primary-300 font-medium">
            التقييم:
          </Text>
          <Text
            selectable
            className="text-xs font-bold text-primary-800 dark:text-primary-200"
            style={{ fontVariant: ['tabular-nums'] }}
            testID={`join-request-score-${item.id}`}
          >
            {item.score}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View className="h-px bg-gray-100 dark:bg-gray-800 w-full" />

      {/* Bottom row: Created At & Status */}
      <View className="flex-row-reverse items-center justify-between">
        <View className="flex-row-reverse items-center gap-1.5">
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            تاريخ التقديم:
          </Text>
          <Text
            selectable
            className="text-xs font-medium text-gray-700 dark:text-gray-300"
            testID={`join-request-created-at-${item.id}`}
          >
            {formatDate(item.created_at)}
          </Text>
        </View>
        <StatusBadge
          status="قيد المراجعة"
          variant="warning"
          testID={`join-request-status-badge-${item.id}`}
        />
      </View>
    </Pressable>
  );
}
