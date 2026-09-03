/**
 * Type scale — Noto Sans Arabic (Figma "Irtaki — Premium Minimal").
 *
 * React Native cannot derive Medium/SemiBold from one family name, so each
 * step pairs a `font-sans*` family class with a `text-<step>` size class
 * (size + line-height + tracking live in tailwind.config.js `fontSize`).
 * Screens compose `typography.<step>` with a colour token and `text-right`;
 * they never hand-pick sizes.
 */
import type { TextStyle } from 'react-native';

export const fontFamilies = {
  regular: 'NotoSansArabic_400Regular',
  medium: 'NotoSansArabic_500Medium',
  semiBold: 'NotoSansArabic_600SemiBold',
} as const;

export const typography = {
  /** heading/xl 28/40 SemiBold — hero numbers, screen-level counts */
  headingXl: 'font-sans-semibold text-heading-xl',
  /** heading/lg 22/34 SemiBold — tab-root titles */
  headingLg: 'font-sans-semibold text-heading-lg',
  /** heading/md 18/30 SemiBold — stacked-screen titles, dialog titles, metric values */
  headingMd: 'font-sans-semibold text-heading-md',
  /** heading/sm 16/26 SemiBold — card titles */
  headingSm: 'font-sans-semibold text-heading-sm',
  /** body/lg 17/30 Regular — input values, range trigger text */
  bodyLg: 'font-sans text-body-lg',
  /** body/md 15/26 Regular — body copy, dialog body, banners */
  bodyMd: 'font-sans text-body-md',
  /** body/md-medium 15/26 Medium — row titles, toast text */
  bodyMdMedium: 'font-sans-medium text-body-md',
  /** body/sm 13/22 Regular — row subtitles, helper/error text */
  bodySm: 'font-sans text-body-sm',
  /** label/lg 16/24 Medium — large button labels */
  labelLg: 'font-sans-medium text-label-lg',
  /** label/md 14/22 Medium — field labels, small buttons, segments, chips */
  labelMd: 'font-sans-medium text-label-md',
  /** label/sm 12/18 Medium +0.2 — badges, tab labels, day letters, tile labels */
  labelSm: 'font-sans-medium text-label-sm',
  /** caption 12/18 Regular — tile captions, ring caption */
  caption: 'font-sans text-caption',
} as const;

export type TypographyToken = keyof typeof typography;

/**
 * The same scale as `TextStyle` objects for the rare places that must set
 * text style imperatively (measured layouts, `adjustsFontSizeToFit` blocks).
 */
export const typeStyles: Record<TypographyToken, TextStyle> = {
  headingXl: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 28,
    lineHeight: 40,
  },
  headingLg: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 22,
    lineHeight: 34,
  },
  headingMd: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 30,
  },
  headingSm: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 26,
  },
  bodyLg: { fontFamily: fontFamilies.regular, fontSize: 17, lineHeight: 30 },
  bodyMd: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 26 },
  bodyMdMedium: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 26,
  },
  bodySm: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 22 },
  labelLg: { fontFamily: fontFamilies.medium, fontSize: 16, lineHeight: 24 },
  labelMd: { fontFamily: fontFamilies.medium, fontSize: 14, lineHeight: 22 },
  labelSm: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  caption: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 18 },
};
