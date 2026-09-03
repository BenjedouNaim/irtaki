import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Icon } from './Icon';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';

export interface TopBarProps {
  title: string;
  /**
   * `true` (default): 40px round back control on the RIGHT + centred 18/30
   * title. `false`: tab-root layout with a right-aligned 22/34 title.
   */
  back?: boolean;
  /** Defaults to `router.back()`. */
  onBack?: () => void;
  /** Optional trailing slot — rendered on the LEFT (e.g. a bell). */
  trailing?: React.ReactNode;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Back-control hit area is 40px; the slop reaches the 48dp minimum (UF §32). */
const BACK_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

/**
 * Figma TopBar (10:39). Navigation header, 56px, 16px side padding. Back
 * control top-right (UF §31), title centred when a back control exists,
 * right-aligned large title on tab roots; trailing slot on the left.
 */
export function TopBar({
  title,
  back = true,
  onBack,
  trailing,
  testID = 'top-bar',
  className,
  style,
}: TopBarProps) {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View
      testID={testID}
      className={`${rowStart} h-14 items-center px-4 gap-2 w-full ${className ?? ''}`}
      style={style}
    >
      {back ? (
        <Pressable
          testID={`${testID}-back`}
          onPress={handleBack}
          hitSlop={BACK_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          className="w-10 h-10 rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center active:opacity-80"
        >
          <Icon name="chevron-right" size={22} tone="primary" />
        </Pressable>
      ) : null}
      <Text
        testID={`${testID}-title`}
        accessibilityRole="header"
        numberOfLines={1}
        className={`flex-1 text-fg dark:text-fg-dark ${
          back
            ? `${typography.headingMd} text-center`
            : `${typography.headingLg} text-right`
        }`}
      >
        {title}
      </Text>
      {trailing ? (
        <View
          testID={`${testID}-trailing`}
          className="w-10 h-10 items-center justify-center"
        >
          {trailing}
        </View>
      ) : null}
    </View>
  );
}
