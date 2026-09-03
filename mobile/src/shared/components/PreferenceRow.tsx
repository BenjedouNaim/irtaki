import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Toggle } from './Toggle';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

export interface PreferenceRowProps {
  title: string;
  subtitle?: string;
  /** `undefined` renders no toggle (account-critical categories). */
  value?: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma PreferenceRow (19:159): 72px row — category title + description
 * (right) and a mute Toggle (left). Account-critical categories render
 * without a toggle. Component only — Notification Preferences is not built.
 */
export function PreferenceRow({
  title,
  subtitle,
  value,
  onChange,
  disabled = false,
  testID = 'preference-row',
  className,
  style,
}: PreferenceRowProps) {
  return (
    <View
      testID={testID}
      className={`${rowStart} items-center h-[72px] px-4 gap-4 w-full ${className ?? ''}`}
      style={style}
    >
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
            numberOfLines={2}
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value !== undefined ? (
        <Toggle
          testID={`${testID}-toggle`}
          on={value}
          onChange={(next) => onChange?.(next)}
          disabled={disabled || !onChange}
          accessibilityLabel={title}
        />
      ) : null}
    </View>
  );
}
