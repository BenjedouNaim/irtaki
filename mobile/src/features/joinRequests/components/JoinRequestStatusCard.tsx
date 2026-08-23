import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import {
  StatusBadge,
  StatusBadgeVariant,
} from '@/shared/components/StatusBadge';
import { Button } from '@/shared/components/Button';

export interface JoinRequestStatusCardProps {
  status: 'Pending' | 'Accepted' | 'Rejected';
  onApplyAgain?: () => void;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

interface StatusConfig {
  badgeStatus: string;
  badgeVariant: StatusBadgeVariant;
  title: string;
  description: string;
  showApplyAgain: boolean;
}

const STATUS_CONFIGS: Record<
  'Pending' | 'Accepted' | 'Rejected',
  StatusConfig
> = {
  Pending: {
    badgeStatus: 'قيد المراجعة',
    badgeVariant: 'warning',
    title: 'طلب الانضمام قيد المراجعة',
    description:
      'طلبك للانضمام إلى الحلقة قيد المراجعة من قبل المشرف. سيتم إشعارك بالنتيجة فور اتخاذ القرار.',
    showApplyAgain: false,
  },
  Rejected: {
    badgeStatus: 'لم يتم القبول',
    badgeVariant: 'error',
    title: 'لم يتم قبول الطلب هذه المرة',
    description: 'يمكنك إعادة التقديم واختيار حلقة أخرى تناسب جدولك ومستواك.',
    showApplyAgain: true,
  },
  Accepted: {
    badgeStatus: 'تم القبول',
    badgeVariant: 'success',
    title: 'تم قبول طلبك',
    description: 'مبارك! تم قبول انضمامك إلى الحلقة بنجاح.',
    showApplyAgain: false,
  },
};

export function JoinRequestStatusCard({
  status,
  onApplyAgain,
  testID = 'join-request-status-card',
  className,
  style,
}: JoinRequestStatusCardProps) {
  const config = STATUS_CONFIGS[status] || STATUS_CONFIGS.Pending;

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`حالة طلب الانضمام: ${config.badgeStatus}. ${config.title}`}
      className={`w-full p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="flex-row items-center justify-between mb-3">
        <StatusBadge
          status={config.badgeStatus}
          variant={config.badgeVariant}
          testID="join-request-status-badge"
        />
      </View>

      <Text
        className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2 text-right"
        testID="join-request-status-title"
      >
        {config.title}
      </Text>

      <Text
        className="text-sm text-gray-600 dark:text-gray-400 text-right leading-relaxed mb-4"
        testID="join-request-status-description"
      >
        {config.description}
      </Text>

      {config.showApplyAgain && onApplyAgain && (
        <Button
          label="التقديم مجدداً"
          variant="primary"
          onPress={onApplyAgain}
          testID="apply-again-button"
          className="w-full mt-1"
        />
      )}
    </View>
  );
}
