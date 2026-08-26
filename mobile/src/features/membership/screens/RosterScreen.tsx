import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList } from 'react-native';
import { Button } from '@/shared/components/Button';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import {
  getGroupMemberships,
  RosterEntry,
} from '@/shared/api/memberships.client';
import { ApiError } from '@/shared/api/types';

export default function RosterScreen({ groupId }: { groupId: string }) {
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

  const renderItem = ({ item }: { item: RosterEntry }) => (
    <View
      testID={`roster-row-${item.id}`}
      className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex-row-reverse items-center justify-between gap-3"
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
    </View>
  );

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
