import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName } from './Icon';
import { typography } from '@/shared/theme/typography';

export interface EmptyStateProps {
  message: string;
  /** Swap per screen (UF §23); defaults to the inbox glyph. */
  icon?: IconName;
  /** Rare optional CTA rendered under the message. */
  children?: React.ReactNode;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma EmptyState (14:91): 56px subtle ring with a 24px icon + one factual
 * line, no forced CTA.
 */
export function EmptyState({
  message,
  icon = 'inbox',
  children,
  testID = 'empty-state',
  className,
  style,
}: EmptyStateProps) {
  return (
    <View
      testID={testID}
      className={`w-full items-center py-12 gap-3 ${className ?? ''}`}
      style={style}
    >
      <View className="w-14 h-14 rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center">
        <Icon
          name={icon}
          size={24}
          tone="secondary"
          testID={`${testID}-icon`}
        />
      </View>
      <Text
        testID={`${testID}-message`}
        className={`${typography.bodyMd} text-center text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {message}
      </Text>
      {children}
    </View>
  );
}
