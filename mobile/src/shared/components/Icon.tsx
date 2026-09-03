import React from 'react';
import { StyleProp } from 'react-native';
import type { ImageStyle } from 'expo-image';
import { Image } from 'expo-image';
import { ICONS, IconName } from './icons';
import { useThemeColors, ThemeColors } from '@/shared/theme/colors';

export type { IconName } from './icons';

/** Semantic tint, resolved against the current colour scheme. */
export type IconTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'disabled'
  | 'brand'
  | 'on-primary'
  | 'inverse'
  | 'accent'
  | 'warning'
  | 'error'
  | 'success'
  | 'info';

const TONE_KEY: Record<IconTone, keyof ThemeColors> = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  disabled: 'textDisabled',
  brand: 'textBrand',
  'on-primary': 'textOnPrimary',
  inverse: 'textInverse',
  accent: 'textAccent',
  warning: 'textWarning',
  error: 'textError',
  success: 'textSuccess',
  info: 'textInfo',
};

export interface IconProps {
  name: IconName;
  /** Square size in dp (Figma icons are drawn on a 24px grid). */
  size?: number;
  /** Explicit colour; wins over `tone`. */
  tintColor?: string;
  /** Token-based colour, dark-aware. Defaults to text/primary. */
  tone?: IconTone;
  /**
   * Set only when the icon carries meaning on its own (icon-only control,
   * status glyph). Without it the icon is decorative and hidden from
   * assistive technology (UF §32).
   */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ImageStyle>;
}

/**
 * Stroke icon from the Figma icon set, rendered with `expo-image` from the
 * exported SVG and recoloured with `tintColor` (supported for SVG on iOS and
 * Android by expo-image; on web the SVG renders in its authored colour).
 */
export function Icon({
  name,
  size = 24,
  tintColor,
  tone = 'primary',
  accessibilityLabel,
  testID,
  style,
}: IconProps) {
  const colors = useThemeColors();
  const color = tintColor ?? colors[TONE_KEY[tone]];
  const decorative = !accessibilityLabel;

  return (
    <Image
      testID={testID}
      source={ICONS[name]}
      contentFit="contain"
      tintColor={color}
      style={[{ width: size, height: size }, style]}
      accessible={!decorative}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    />
  );
}
