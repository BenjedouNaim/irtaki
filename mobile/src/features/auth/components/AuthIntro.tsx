import React from 'react';
import { View, Text } from 'react-native';
import { typography } from '@/shared/theme/typography';
import { itemsStart } from '@/shared/theme/rtl';

export interface AuthIntroProps {
  title: string;
  subtitle: string;
  testID?: string;
}

/**
 * The Intro block under the TopBar on the stacked auth screens (20:171,
 * 21:166, 21:250): heading/xl title and body/md secondary subtitle, 6px
 * apart, right-aligned, 8px below the bar.
 */
export function AuthIntro({ title, subtitle, testID }: AuthIntroProps) {
  return (
    <View testID={testID} className={`w-full pt-2 gap-1.5 ${itemsStart}`}>
      <Text
        accessibilityRole="header"
        className={`w-full ${typography.headingXl} text-right text-fg dark:text-fg-dark`}
      >
        {title}
      </Text>
      <Text
        className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {subtitle}
      </Text>
    </View>
  );
}
