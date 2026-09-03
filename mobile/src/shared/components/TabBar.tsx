import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName } from './Icon';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';

export type TabBarRole = 'student' | 'assistant';

export interface TabBarItem {
  key: string;
  label: string;
  icon: IconName;
}

/** Figma TabBar.Role sets — first item is the rightmost tab (UF §31). */
export const TAB_BAR_ITEMS: Record<TabBarRole, TabBarItem[]> = {
  student: [
    { key: 'home', label: 'الرئيسية', icon: 'home' },
    { key: 'progress', label: 'التقدّم', icon: 'chart' },
    { key: 'payment', label: 'الدفع', icon: 'wallet' },
  ],
  assistant: [
    { key: 'home', label: 'الرئيسية', icon: 'home' },
    { key: 'join-requests', label: 'طلبات الانضمام', icon: 'inbox' },
    { key: 'payments', label: 'المدفوعات', icon: 'wallet' },
  ],
};

export interface TabBarProps {
  /** Picks the Figma item set; ignored when `items` is given. */
  role?: TabBarRole;
  items?: TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /**
   * Safe-area bottom inset. Figma's 84px bar includes a 34px home indicator;
   * pass `insets.bottom` from `useSafeAreaInsets()` on device.
   */
  bottomInset?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** 84 − 10 (top pad) − 52 (tab content) = the space Figma leaves for the home indicator. */
const DEFAULT_BOTTOM_INSET = 22;

/**
 * Figma TabBar (10:151). Student: Home · Progress · Payment. Assistant:
 * Home · Join Requests · Payments. 1px top line, 10px top pad, active tint
 * text/brand. Teacher/Admin/User use no tabs.
 */
export function TabBar({
  role = 'student',
  items,
  activeKey,
  onSelect,
  bottomInset = DEFAULT_BOTTOM_INSET,
  testID = 'tab-bar',
  style,
}: TabBarProps) {
  const tabs = items ?? TAB_BAR_ITEMS[role];

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      className={`${rowStart} items-start w-full pt-[10px] bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark`}
      style={[{ paddingBottom: bottomInset }, style]}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            testID={`${testID}-${tab.key}`}
            onPress={() => onSelect(tab.key)}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            className="flex-1 items-center gap-1 pt-1.5 min-h-[52px]"
          >
            <Icon
              name={tab.icon}
              size={24}
              tone={active ? 'brand' : 'tertiary'}
            />
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              className={`text-center ${
                active
                  ? 'font-sans-semibold text-label-sm text-brand dark:text-brand-dark'
                  : `${typography.labelSm} text-fg-tertiary dark:text-fg-tertiary-dark`
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
