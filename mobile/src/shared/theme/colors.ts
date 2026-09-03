/**
 * Runtime mirror of the semantic colour tokens declared in `tailwind.config.js`
 * (Figma "Irtaki — Premium Minimal"). Use `className` tokens wherever possible;
 * reach for these only where React Native needs a literal colour — `tintColor`,
 * `ActivityIndicator`, `RefreshControl`, computed ring geometry, …
 */
import { useColorScheme } from 'react-native';

export const lightColors = {
  bgCanvas: '#FAF7EF',
  bgSurface: '#FFFFFF',
  bgSubtle: '#F3F1E6',
  bgMuted: '#E4E0D0',
  bgPrimary: '#0E6B4A',
  bgPrimarySubtle: '#EAF6F1',
  bgError: '#A8402C',
  bgErrorSubtle: '#FBEEEA',
  bgWarningSubtle: '#FBF4E6',
  bgAccentSubtle: '#FBF4E6',
  bgSuccessSubtle: '#EAF6F1',
  bgInfoSubtle: '#EFF6FF',
  bgInverse: '#1B2420',

  textPrimary: '#1B2420',
  textSecondary: '#6B6A57',
  textTertiary: '#A29C7E',
  textDisabled: '#CBC5AC',
  textBrand: '#0E6B4A',
  textOnPrimary: '#FFFFFF',
  textInverse: '#FFFFFF',
  textAccent: '#7F5824',
  textWarning: '#7F5824',
  textError: '#87331F',
  textSuccess: '#0E6B4A',
  textInfo: '#1D4ED8',

  borderDefault: '#E4E0D0',
  borderBrand: '#0E6B4A',
  borderStrong: '#CBC5AC',
  borderWarning: '#EDCE94',
  borderError: '#A8402C',
  borderSuccess: '#9CD7BF',
  borderInfo: '#BFDBFE',

  dotSuccess: '#177052',
  dotWarning: '#C08A3E',
  dotError: '#A8402C',
  dotInfo: '#2563EB',
  dotNeutral: '#6B6A57',

  stripReported: '#177052',
  stripExcused: '#CBC5AC',
  stripMissed: '#C36F4E',
  stripFuture: '#F3F1E6',
} as const;

export type ThemeColors = { [K in keyof typeof lightColors]: string };

export const darkColors: ThemeColors = {
  ...lightColors,
  bgCanvas: '#10140F',
  bgSurface: '#1B2420',
  bgSubtle: '#292720',
  bgMuted: '#3D3B2C',
  bgPrimary: '#238A66',
  bgPrimarySubtle: '#04241A',
  bgWarningSubtle: '#402D12',
  bgAccentSubtle: '#402D12',
  bgInverse: '#FAF7EF',

  textPrimary: '#FAF7EF',
  textSecondary: '#A29C7E',
  textTertiary: '#6B6A57',
  textBrand: '#68BD9C',
  textInverse: '#1B2420',
  textAccent: '#DFB066',
  textWarning: '#DFB066',

  borderDefault: '#3D3B2C',
  borderBrand: '#3CA37D',
  borderWarning: '#7F5824',

  dotWarning: '#DFB066',

  stripReported: '#3CA37D',
  stripExcused: '#54523F',
  stripFuture: '#292720',
};

export function getThemeColors(scheme: 'light' | 'dark' | null | undefined) {
  return scheme === 'dark' ? darkColors : lightColors;
}

/** The semantic palette for the current OS colour scheme. */
export function useThemeColors(): ThemeColors {
  return getThemeColors(useColorScheme());
}

/**
 * shadow/floating — reserved for dialogs, sheets and toasts (cards use a 1px
 * border/default and no shadow). Expressed as RN shadow props because
 * NativeWind cannot represent a negative spread.
 */
export const SHADOW_FLOATING = {
  shadowColor: '#1B2420',
  shadowOffset: { width: 0, height: 12 },
  shadowRadius: 16,
  shadowOpacity: 0.1,
  elevation: 8,
} as const;

/** shadow/card — the raised pill of a selected Segment. */
export const SHADOW_CARD = {
  shadowColor: '#1B2420',
  shadowOffset: { width: 0, height: 4 },
  shadowRadius: 8,
  shadowOpacity: 0.06,
  elevation: 2,
} as const;
