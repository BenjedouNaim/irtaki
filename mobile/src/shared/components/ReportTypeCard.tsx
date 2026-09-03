import React from 'react';
import { Pressable, View, Text, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName } from './Icon';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

/** Figma ReportTypeCard.Type — Normal · Revision · Absent. */
export type ReportType = 'normal' | 'revision' | 'absent';

export const REPORT_TYPE_CARD_COPY: Record<
  ReportType,
  { title: string; subtitle: string; icon: IconName }
> = {
  normal: {
    title: 'تقرير عادي',
    subtitle: 'حفظ جديد و/أو مراجعة و تفسير',
    icon: 'pen',
  },
  revision: {
    title: 'مراجعة فقط',
    subtitle: 'نطاق المراجعة والوقت',
    icon: 'repeat',
  },
  absent: {
    title: 'غياب',
    subtitle: 'مريض · دراسة · سبب آخر',
    icon: 'user-x',
  },
};

export interface ReportTypeCardProps {
  type: ReportType;
  onPress: () => void;
  title?: string;
  subtitle?: string;
  disabled?: boolean;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma ReportTypeCard (17:106): 92px surface card — 48px icon tile
 * (right), title + subtitle, chevron (left). Three equal-weight cards, no
 * default pre-selected.
 */
export function ReportTypeCard({
  type,
  onPress,
  title,
  subtitle,
  disabled = false,
  testID,
  className,
  style,
}: ReportTypeCardProps) {
  const copy = REPORT_TYPE_CARD_COPY[type];
  const id = testID ?? `report-type-card-${type}`;
  const titleText = title ?? copy.title;
  const subtitleText = subtitle ?? copy.subtitle;

  return (
    <Pressable
      testID={id}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${titleText}، ${subtitleText}`}
      accessibilityState={{ disabled }}
      className={`${rowStart} items-center h-[92px] px-5 gap-4 w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark active:opacity-80 ${
        disabled ? 'opacity-50' : ''
      } ${className ?? ''}`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View
        className="w-12 h-12 rounded-md bg-primary-subtle dark:bg-primary-subtle-dark items-center justify-center"
        style={{ borderCurve: 'continuous' }}
      >
        <Icon name={copy.icon} size={22} tone="brand" testID={`${id}-icon`} />
      </View>
      <View className={`flex-1 gap-0.5 ${itemsStart}`}>
        <Text
          testID={`${id}-title`}
          className={`w-full ${typography.headingSm} text-right text-fg dark:text-fg-dark`}
        >
          {titleText}
        </Text>
        <Text
          testID={`${id}-subtitle`}
          className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        >
          {subtitleText}
        </Text>
      </View>
      <Icon name="chevron-left" size={20} tone="tertiary" />
    </Pressable>
  );
}
