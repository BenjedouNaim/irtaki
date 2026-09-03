import React from 'react';
import { Pressable, Text, View, StyleProp, ViewStyle } from 'react-native';
import { typography } from '@/shared/theme/typography';

/** Figma Chip.Type — Ahzab (48×44 numbered toggle) · Filter (36px pill). */
export type ChipType = 'ahzab' | 'filter';

export interface ChipProps {
  label: string;
  type?: ChipType;
  selected?: boolean;
  /** Ahzab read-only mode (Applicant Detail): filled/empty, no interaction. */
  readOnly?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const AHZAB_HIT_SLOP = { top: 2, bottom: 2, left: 0, right: 0 };
const FILTER_HIT_SLOP = { top: 6, bottom: 6, left: 0, right: 0 };

/**
 * Figma Chip (9:23). Ahzab: 60-chip numbered toggle grid (interactive) and
 * read-only filled/empty mode; Filter: status filter pills. Selected =
 * bg/primary + text/on-primary; unselected = surface + border/default.
 */
export function Chip({
  label,
  type = 'ahzab',
  selected = false,
  readOnly = false,
  onPress,
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: ChipProps) {
  const isAhzab = type === 'ahzab';
  const shape = isAhzab ? 'w-12 h-11 rounded-sm' : 'h-9 px-4 rounded-full';
  const fill = selected
    ? 'bg-primary dark:bg-primary-dark'
    : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark';
  const text = selected
    ? 'text-fg-on-primary'
    : readOnly
      ? 'text-fg-tertiary dark:text-fg-tertiary-dark'
      : 'text-fg dark:text-fg-dark';

  const content = (
    <Text
      numberOfLines={1}
      maxFontSizeMultiplier={1.4}
      className={`${typography.labelMd} text-center ${text}`}
    >
      {label}
    </Text>
  );

  if (readOnly) {
    return (
      <View
        testID={testID}
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ selected }}
        className={`items-center justify-center opacity-90 ${shape} ${fill}`}
        style={[{ borderCurve: 'continuous' }, style]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={isAhzab ? AHZAB_HIT_SLOP : FILTER_HIT_SLOP}
      accessibilityRole={isAhzab ? 'checkbox' : 'radio'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={
        isAhzab ? { checked: selected, disabled } : { selected, disabled }
      }
      className={`items-center justify-center active:opacity-80 ${shape} ${fill} ${
        disabled ? 'opacity-50' : ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      {content}
    </Pressable>
  );
}
