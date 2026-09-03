import React, { useEffect } from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName } from './Icon';
import { typography } from '@/shared/theme/typography';
import { SHADOW_FLOATING } from '@/shared/theme/colors';
import { rowStart } from '@/shared/theme/rtl';

export interface ToastProps {
  message: string;
  icon?: IconName;
  /** Called after `duration` ms — the toast is single-line and auto-dismisses. */
  onDismiss?: () => void;
  duration?: number;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export const TOAST_DURATION_MS = 3000;

/**
 * Figma Toast (11:70). Single-line success toast on every mutating action's
 * success path (UF §29); inverse ground, circle-check icon, floating shadow.
 * Positioning (bottom inset, above the tab bar) is the host screen's.
 */
export function Toast({
  message,
  icon = 'circle-check',
  onDismiss,
  duration = TOAST_DURATION_MS,
  testID = 'toast',
  className,
  style,
}: ToastProps) {
  useEffect(() => {
    if (!onDismiss) return undefined;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={`${rowStart} items-center h-[52px] rounded-md ps-3.5 pe-4 gap-2.5 w-full bg-inverse dark:bg-inverse-dark ${
        className ?? ''
      }`}
      style={[SHADOW_FLOATING, { borderCurve: 'continuous' }, style]}
    >
      <Icon name={icon} size={20} tone="inverse" testID={`${testID}-icon`} />
      <Text
        testID={`${testID}-message`}
        numberOfLines={1}
        className={`flex-1 ${typography.bodyMdMedium} text-right text-fg-inverse dark:text-fg-inverse-dark`}
      >
        {message}
      </Text>
    </View>
  );
}
