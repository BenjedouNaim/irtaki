import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName, IconTone } from '@/shared/components/Icon';
import {
  StatusBadge,
  StatusBadgeVariant,
} from '@/shared/components/StatusBadge';
import { Button } from '@/shared/components/Button';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

export type JoinRequestStatus = 'Pending' | 'Accepted' | 'Rejected';

export interface JoinRequestStatusCardProps {
  status: JoinRequestStatus;
  onApplyAgain?: () => void;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

interface StatusConfig {
  badgeStatus: string;
  badgeVariant: StatusBadgeVariant;
  icon: IconName;
  iconTone: IconTone;
  ring: string;
  title: string;
  description: string;
  showApplyAgain: boolean;
}

/**
 * Figma SCR-05 status cards (22:81 pending · 22:125 rejected). The accepted
 * state has no frame — an accepted applicant becomes a Student — so it
 * reuses the same construction with the success tone.
 */
const STATUS_CONFIGS: Record<JoinRequestStatus, StatusConfig> = {
  Pending: {
    badgeStatus: 'قيد المراجعة',
    badgeVariant: 'warning',
    icon: 'clock',
    iconTone: 'warning',
    ring: 'bg-warning-subtle dark:bg-warning-subtle-dark',
    title: 'طلبك قيد المراجعة',
    description:
      'سيصلك إشعار فور البتّ في طلبك. لا يمكن تقديم طلب آخر حتى ذلك الحين.',
    showApplyAgain: false,
  },
  Rejected: {
    badgeStatus: 'لم يُقبل',
    badgeVariant: 'neutral',
    icon: 'circle-x',
    iconTone: 'secondary',
    ring: 'bg-subtle dark:bg-subtle-dark',
    title: 'لم يُقبل طلبك هذه المرة',
    description: 'يمكنك التقديم مجددًا فورًا على أي مجموعة متاحة.',
    showApplyAgain: true,
  },
  Accepted: {
    badgeStatus: 'تم القبول',
    badgeVariant: 'success',
    icon: 'circle-check',
    iconTone: 'success',
    ring: 'bg-success-subtle',
    title: 'تم قبول طلبك',
    description: 'قُبل انضمامك إلى المجموعة.',
    showApplyAgain: false,
  },
};

const CARD_CLASS =
  'w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark p-5 gap-4';

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
      className={`${CARD_CLASS} ${itemsStart} ${className ?? ''}`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className={`${rowStart} items-center justify-between w-full`}>
        <View
          className={`w-12 h-12 rounded-full items-center justify-center ${config.ring}`}
        >
          <Icon name={config.icon} size={21} tone={config.iconTone} />
        </View>
        <StatusBadge
          status={config.badgeStatus}
          variant={config.badgeVariant}
          testID="join-request-status-badge"
          style={{ alignSelf: 'center' }}
        />
      </View>

      <Text
        className={`w-full ${typography.headingMd} text-right text-fg dark:text-fg-dark`}
        testID="join-request-status-title"
      >
        {config.title}
      </Text>

      <Text
        className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        testID="join-request-status-description"
      >
        {config.description}
      </Text>

      {config.showApplyAgain && onApplyAgain ? (
        <Button
          label="التقديم مجددًا"
          variant="primary"
          onPress={onApplyAgain}
          testID="apply-again-button"
          className="w-full"
        />
      ) : null}
    </View>
  );
}

export interface NoJoinRequestCardProps {
  onBrowseGroups: () => void;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Figma SCR-05 · no request (22:38): the "Browse Groups" CTA card (UF §10). */
export function NoJoinRequestCard({
  onBrowseGroups,
  testID = 'no-join-request-card',
  className,
  style,
}: NoJoinRequestCardProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel="لم تنضم إلى مجموعة بعد"
      className={`${CARD_CLASS} ${itemsStart} ${className ?? ''}`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="w-14 h-14 rounded-full items-center justify-center bg-primary-subtle dark:bg-primary-subtle-dark">
        <Icon name="layers" size={24} tone="brand" />
      </View>
      <Text
        className={`w-full ${typography.headingMd} text-right text-fg dark:text-fg-dark`}
        testID={`${testID}-title`}
      >
        لم تنضم إلى مجموعة بعد
      </Text>
      <Text
        className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        testID={`${testID}-description`}
      >
        تصفّح المجموعات المتاحة وقدّم طلب انضمام واحد.
      </Text>
      <Button
        label="تصفّح المجموعات"
        variant="primary"
        onPress={onBrowseGroups}
        testID="browse-groups-button"
        className="w-full"
      />
    </View>
  );
}
