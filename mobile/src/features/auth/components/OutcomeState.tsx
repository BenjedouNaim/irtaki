import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName, IconTone } from '@/shared/components/Icon';
import { typography } from '@/shared/theme/typography';

/** Ring fill — brand (sent), error (expired token), neutral (can't connect). */
export type OutcomeTone = 'brand' | 'error' | 'neutral';

export interface OutcomeStateProps {
  icon: IconName;
  tone?: OutcomeTone;
  title: string;
  body: string;
  /** The single CTA under the copy (Ghost or Primary Button). */
  children?: React.ReactNode;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

const RINGS: Record<OutcomeTone, { ring: string; icon: IconTone }> = {
  brand: {
    ring: 'bg-primary-subtle dark:bg-primary-subtle-dark',
    icon: 'brand',
  },
  error: { ring: 'bg-error-subtle', icon: 'error' },
  neutral: { ring: 'bg-subtle dark:bg-subtle-dark', icon: 'primary' },
};

/**
 * The centred outcome layout shared by "Forgot · Sent" (21:182), "Reset ·
 * Expired" (21:267) and "Cold start · can't connect" (43:8): a 72px ring with
 * a 30px icon, heading/lg title, body/md copy and one full-width CTA, all
 * centred in the remaining height.
 */
export function OutcomeState({
  icon,
  tone = 'brand',
  title,
  body,
  children,
  testID = 'outcome-state',
  className,
  style,
}: OutcomeStateProps) {
  const t = RINGS[tone];

  return (
    <View
      testID={testID}
      className={`flex-1 w-full items-center justify-center px-4 gap-5 ${
        className ?? ''
      }`}
      style={style}
    >
      <View
        className={`w-[72px] h-[72px] rounded-full items-center justify-center ${t.ring}`}
      >
        <Icon
          name={icon}
          size={30}
          tone={t.icon}
          testID={`${testID}-icon`}
          accessibilityLabel="تنبيه"
        />
      </View>
      <Text
        testID={`${testID}-title`}
        accessibilityRole="header"
        className={`w-full ${typography.headingLg} text-center text-fg dark:text-fg-dark`}
      >
        {title}
      </Text>
      <Text
        testID={`${testID}-body`}
        className={`w-full ${typography.bodyMd} text-center text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {body}
      </Text>
      {children}
    </View>
  );
}
