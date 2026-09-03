import React from 'react';
import { Pressable, Text } from 'react-native';
import { typography } from '@/shared/theme/typography';
import { SHADOW_CARD } from '@/shared/theme/colors';

export interface SegmentProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Full label for assistive tech, e.g. "<question> نعم" (UF §32). */
  accessibilityLabel?: string;
  testID?: string;
}

/** Segments are 40px tall; the slop reaches 48dp (UF §32). */
const HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 };

/**
 * Figma Segment (7:6): one option of a SegmentedControl. Selected = raised
 * surface pill with the card shadow, text/primary; unselected = bare,
 * text/secondary.
 */
export function Segment({
  label,
  selected,
  onPress,
  disabled = false,
  accessibilityLabel,
  testID,
}: SegmentProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      className={`flex-1 h-10 rounded-sm items-center justify-center ${
        selected ? 'bg-surface dark:bg-surface-dark' : ''
      } ${disabled ? 'opacity-50' : ''}`}
      style={[{ borderCurve: 'continuous' }, selected ? SHADOW_CARD : null]}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        className={`${typography.labelMd} text-center ${
          selected
            ? 'text-fg dark:text-fg-dark'
            : 'text-fg-secondary dark:text-fg-secondary-dark'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
