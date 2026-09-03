import React from 'react';
import { Pressable, Text, StyleProp, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';

export const RANGE_TRIGGER_PLACEHOLDER = 'اختر النطاق';

export interface RangeTriggerProps {
  /** Summary "Surah ayah ← Surah ayah" (Western numerals); `null` = Empty. */
  value: string | null;
  onPress: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Draws the 1.5px border/error (the message lives in the FormField). */
  error?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma RangeTrigger (19:117): 56px surface field — book icon (right),
 * value or placeholder (body/lg), chevron (left). Opens the two-step Range
 * Picker sheet (FROM surah→ayah, TO surah→ayah).
 */
export function RangeTrigger({
  value,
  onPress,
  placeholder = RANGE_TRIGGER_PLACEHOLDER,
  disabled = false,
  error = false,
  accessibilityLabel,
  testID = 'range-trigger',
  className,
  style,
}: RangeTriggerProps) {
  const filled = Boolean(value);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? placeholder}
      accessibilityValue={{ text: value ?? undefined }}
      accessibilityState={{ disabled }}
      className={`${rowStart} items-center h-14 px-4 gap-3 w-full rounded-md bg-surface dark:bg-surface-dark active:opacity-80 ${
        error
          ? 'border-[1.5px] border-line-error'
          : 'border border-line dark:border-line-dark'
      } ${disabled ? 'opacity-50' : ''} ${className ?? ''}`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <Icon
        name="book"
        size={20}
        tone={filled ? 'brand' : 'tertiary'}
        testID={`${testID}-icon`}
      />
      <Text
        testID={`${testID}-value`}
        numberOfLines={1}
        className={`flex-1 ${typography.bodyLg} text-right ${
          filled
            ? 'text-fg dark:text-fg-dark'
            : 'text-fg-tertiary dark:text-fg-tertiary-dark'
        }`}
      >
        {value ?? placeholder}
      </Text>
      <Icon name="chevron-left" size={20} tone="tertiary" />
    </Pressable>
  );
}
