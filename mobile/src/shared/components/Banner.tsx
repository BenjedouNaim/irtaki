import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName, IconTone } from './Icon';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

/** Figma Banner.Tone — Error (network/server retry) · Warning · Info. */
export type BannerTone = 'error' | 'warning' | 'info';

export interface BannerProps {
  message: string;
  tone?: BannerTone;
  /** Overrides the tone's icon (error: wifi-off · warning: alert · info: info). */
  icon?: IconName;
  /** Renders the "إعادة المحاولة" action under the message. */
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<
  BannerTone,
  {
    container: string;
    text: string;
    retry: string;
    icon: IconName;
    iconTone: IconTone;
  }
> = {
  error: {
    container: 'bg-error-subtle border-line-error',
    text: 'text-fg-error',
    retry: 'border-line-error',
    icon: 'wifi-off',
    iconTone: 'error',
  },
  warning: {
    container:
      'bg-warning-subtle dark:bg-warning-subtle-dark border-line-warning dark:border-line-warning-dark',
    text: 'text-fg-warning dark:text-fg-warning-dark',
    retry: 'border-line-warning dark:border-line-warning-dark',
    icon: 'alert',
    iconTone: 'warning',
  },
  info: {
    container: 'bg-info-subtle border-line-info',
    text: 'text-fg-info',
    retry: 'border-line-info',
    icon: 'info',
    iconTone: 'info',
  },
};

/** The retry pill is 38px tall; the slop reaches 48dp (UF §32). */
const RETRY_HIT_SLOP = { top: 5, bottom: 5, left: 4, right: 4 };

/**
 * Figma Banner (11:121). Inline notice — icon + text, never colour alone
 * (UF §32). Error replaces content or appends at a list bottom with form
 * data preserved (UF §24); Warning = "counts as a missed day"; Info =
 * immutability / activity-pointer reminders.
 */
export function Banner({
  message,
  tone = 'error',
  icon,
  onRetry,
  retryLabel = 'إعادة المحاولة',
  testID = 'banner',
  className,
  style,
}: BannerProps) {
  const t = TONES[tone];

  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'info' ? 'text' : 'alert'}
      className={`w-full rounded-md border px-4 py-3.5 gap-3 ${itemsStart} ${t.container} ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className={`${rowStart} items-start gap-2.5 w-full`}>
        <Icon
          name={icon ?? t.icon}
          size={20}
          tone={t.iconTone}
          testID={`${testID}-icon`}
          accessibilityLabel="تنبيه"
        />
        <Text
          testID={`${testID}-message`}
          className={`flex-1 ${typography.bodyMd} text-right ${t.text}`}
        >
          {message}
        </Text>
      </View>
      {onRetry ? (
        <Pressable
          testID={`${testID}-retry-button`}
          onPress={onRetry}
          hitSlop={RETRY_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          className={`${rowStart} items-center gap-1.5 px-3 py-2 rounded-sm border bg-surface dark:bg-surface-dark active:opacity-80 ${t.retry}`}
          style={{ borderCurve: 'continuous' }}
        >
          <Text className={`${typography.labelMd} text-right ${t.text}`}>
            {retryLabel}
          </Text>
          <Icon name="refresh" size={16} tone={t.iconTone} />
        </Pressable>
      ) : null}
    </View>
  );
}
