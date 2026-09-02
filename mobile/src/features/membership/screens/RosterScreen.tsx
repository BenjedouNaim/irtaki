import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/shared/components/Button';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import {
  getGroupMemberships,
  RosterEntry,
} from '@/shared/api/memberships.client';
import { ApiError } from '@/shared/api/types';

export interface RosterScreenProps {
  groupId: string;
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

export default function RosterScreen({
  groupId,
  onActiveMemberPress,
  canOpenRecovery = true,
}: RosterScreenProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchRoster = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getGroupMemberships(groupId);
      setEntries(response.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل قائمة الطلاب');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

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

  const renderItem = ({ item }: { item: RosterEntry }) => {
    return (
      <Pressable
        testID={`roster-row-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={item.user.full_name || 'غير محدد'}
        disabled={!isRowPressable(item)}
        onPress={() => handleRowPress(item)}
        className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex-row-reverse items-center justify-between gap-3 active:opacity-70"
        style={{ borderCurve: 'continuous' }}
      >
        <Text
          selectable
          className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right flex-1"
        >
          {item.user.full_name || 'غير محدد'}
        </Text>
        <StatusBadge
          status={item.state === 'Active' ? 'نشطة' : 'محذوف'}
          variant={item.state === 'Active' ? 'info' : 'error'}
          testID={`roster-state-badge-${item.id}`}
        />
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-950" testID="roster-screen">
      {isLoading ? (
        <View className="p-4">
          <SkeletonLoader variant="row" count={4} testID="roster-skeleton" />
        </View>
      ) : errorMessage ? (
        <View className="p-4">
          <View
            className="p-4 rounded-xl bg-destructive-50 border border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800 gap-3"
            style={{ borderCurve: 'continuous' }}
            testID="roster-error"
          >
            <Text
              selectable
              className="text-sm font-medium text-destructive-700 dark:text-destructive-300 text-right leading-5"
            >
              {errorMessage}
            </Text>
            <Button
              label="إعادة المحاولة"
              variant="outline"
              onPress={fetchRoster}
              testID="retry-button"
            />
          </View>
        </View>
      ) : entries.length === 0 ? (
        <View className="p-4">
          <View
            testID="roster-empty"
            className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 items-center gap-3 mt-4"
            style={{ borderCurve: 'continuous' }}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center">
              لا يوجد طلاب في هذه الحلقة بعد
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          testID="roster-list"
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}
