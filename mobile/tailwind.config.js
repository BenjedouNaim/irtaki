/** @type {import('tailwindcss').Config} */
//
// Design tokens — Figma "Irtaki — Premium Minimal" (fileKey 9zAM2VcXG8dildsMyTrcpp).
// The numeric scales (gray/primary/accent/destructive/…) are the palette; the
// semantic groups below (canvas, surface, fg, line, dot, strip, …) are the tokens
// screens and components must use. Every semantic token exposes its light value
// as DEFAULT and, where the design differs, its dark value under a `-dark` suffix
// so dark mode is `bg-canvas dark:bg-canvas-dark`. Runtime (non-className) code
// reads the same values from `src/shared/theme/colors.ts` — keep both in sync.
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Warm, low-saturation neutral — replaces Tailwind's default cool gray
        // so every screen (not just auth) reads as one system with the emerald palette.
        gray: {
          50: '#FAF7EF',
          100: '#F3F1E6',
          200: '#E4E0D0',
          300: '#CBC5AC',
          400: '#A29C7E',
          500: '#6B6A57',
          600: '#54523F',
          700: '#3D3B2C',
          800: '#292720',
          900: '#1B2420',
          950: '#10140F',
        },
        // "Zellige" direction — deep emerald, the traditional color of the Quran and mosque tilework.
        primary: {
          DEFAULT: '#0E6B4A',
          50: '#EAF6F1',
          100: '#CDEBDE',
          200: '#9CD7BF',
          300: '#68BD9C',
          400: '#3CA37D',
          500: '#238A66',
          600: '#177052',
          700: '#0E6B4A',
          800: '#0A5138',
          900: '#083F2C',
          950: '#04241A',
          // bg/primary (dark) · bg/primary-subtle (light → dark)
          dark: '#238A66',
          subtle: '#EAF6F1',
          'subtle-dark': '#04241A',
        },
        // Antique gold accent — reserved for secondary emphasis (links, focus, small highlights),
        // never competing with primary or destructive.
        accent: {
          DEFAULT: '#C08A3E',
          50: '#FBF4E6',
          100: '#F6E6C7',
          200: '#EDCE94',
          300: '#DFB066',
          400: '#CD9C52',
          500: '#C08A3E',
          600: '#A06F2E',
          700: '#7F5824',
          800: '#5E421B',
          900: '#402D12',
          950: '#26190A',
          // bg/accent-subtle (light → dark)
          subtle: '#FBF4E6',
          'subtle-dark': '#402D12',
        },
        destructive: {
          DEFAULT: '#A8402C',
          50: '#FBEEEA',
          100: '#F5DAD1',
          200: '#E9BBA9',
          300: '#D89679',
          400: '#C36F4E',
          500: '#B3552F',
          600: '#A8402C',
          700: '#87331F',
          800: '#682718',
          900: '#4A1B10',
          950: '#301207',
        },
        warning: {
          DEFAULT: '#d97706',
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          950: '#451a03',
          // bg/warning-subtle (light → dark) — the Figma warning is the gold family
          subtle: '#FBF4E6',
          'subtle-dark': '#402D12',
        },
        success: {
          DEFAULT: '#16a34a',
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          950: '#052e16',
          // bg/success-subtle
          subtle: '#EAF6F1',
        },
        info: {
          DEFAULT: '#2563eb',
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          950: '#172554',
          // bg/info-subtle
          subtle: '#EFF6FF',
        },

        // ---- Semantic backgrounds (bg/*) ----
        canvas: { DEFAULT: '#FAF7EF', dark: '#10140F' },
        surface: { DEFAULT: '#FFFFFF', dark: '#1B2420' },
        subtle: { DEFAULT: '#F3F1E6', dark: '#292720' },
        muted: { DEFAULT: '#E4E0D0', dark: '#3D3B2C' },
        // bg/error · bg/error-subtle (no dark value in the design)
        error: { DEFAULT: '#A8402C', subtle: '#FBEEEA' },
        // Toast ground (bg/inverse) flips with the scheme
        inverse: { DEFAULT: '#1B2420', dark: '#FAF7EF' },

        // ---- Semantic foregrounds (text/*) → `text-fg-…` ----
        fg: {
          DEFAULT: '#1B2420',
          dark: '#FAF7EF',
          secondary: '#6B6A57',
          'secondary-dark': '#A29C7E',
          tertiary: '#A29C7E',
          'tertiary-dark': '#6B6A57',
          disabled: '#CBC5AC',
          brand: '#0E6B4A',
          'brand-dark': '#68BD9C',
          'on-primary': '#FFFFFF',
          inverse: '#FFFFFF',
          'inverse-dark': '#1B2420',
          accent: '#7F5824',
          'accent-dark': '#DFB066',
          warning: '#7F5824',
          'warning-dark': '#DFB066',
          error: '#87331F',
          success: '#0E6B4A',
          info: '#1D4ED8',
        },
        // text/brand shorthand (`text-brand dark:text-brand-dark`)
        brand: { DEFAULT: '#0E6B4A', dark: '#68BD9C' },

        // ---- Semantic borders (border/*) → `border-line-…`; `border-default` is the alias ----
        line: {
          DEFAULT: '#E4E0D0',
          dark: '#3D3B2C',
          brand: '#0E6B4A',
          'brand-dark': '#3CA37D',
          strong: '#CBC5AC',
          warning: '#EDCE94',
          'warning-dark': '#7F5824',
          error: '#A8402C',
          success: '#9CD7BF',
          info: '#BFDBFE',
        },
        default: { DEFAULT: '#E4E0D0', dark: '#3D3B2C' },

        // ---- Status dots (dot/*) ----
        dot: {
          success: '#177052',
          warning: '#C08A3E',
          'warning-dark': '#DFB066',
          error: '#A8402C',
          info: '#2563EB',
          neutral: '#6B6A57',
        },

        // ---- Weekly strip (strip/*) ----
        strip: {
          reported: '#177052',
          'reported-dark': '#3CA37D',
          excused: '#CBC5AC',
          'excused-dark': '#54523F',
          missed: '#C36F4E',
          future: '#F3F1E6',
          'future-dark': '#292720',
        },
      },
      // radius/* — xs 6 (checkbox, at-risk badge) · sm 10 · md 14 · lg 18 · xl 24 · full 999
      borderRadius: {
        xs: '6px',
        sm: '10px',
        md: '14px',
        lg: '18px',
        xl: '24px',
        full: '999px',
      },
      // Type scale — Noto Sans Arabic. Pair each size with its family class
      // (see src/shared/theme/typography.ts) — RN cannot derive Medium/SemiBold
      // from a single family name, the weight lives in the family.
      fontSize: {
        // display/lg — the auth brand wordmark only (SCR-01)
        'display-lg': [
          '44px',
          // 1.4x rather than Figma's 1.18x: Noto Sans Arabic's ascent is tall
          // enough that a 52px line box clips the top of Latin digits in RN.
          { lineHeight: '62px', letterSpacing: '-0.5px' },
        ],
        'heading-xl': ['28px', { lineHeight: '40px' }],
        'heading-lg': ['22px', { lineHeight: '34px' }],
        'heading-md': ['18px', { lineHeight: '30px' }],
        'heading-sm': ['16px', { lineHeight: '26px' }],
        'body-lg': ['17px', { lineHeight: '30px' }],
        'body-md': ['15px', { lineHeight: '26px' }],
        'body-sm': ['13px', { lineHeight: '22px' }],
        'label-lg': ['16px', { lineHeight: '24px' }],
        'label-md': ['14px', { lineHeight: '22px' }],
        'label-sm': ['12px', { lineHeight: '18px', letterSpacing: '0.2px' }],
        caption: ['12px', { lineHeight: '18px' }],
        // overline 11/16 SemiBold +0.8 — section labels (Figma "overline")
        overline: ['11px', { lineHeight: '16px', letterSpacing: '0.8px' }],
      },
      fontFamily: {
        sans: ['NotoSansArabic_400Regular', 'sans-serif'],
        'sans-medium': ['NotoSansArabic_500Medium', 'sans-serif'],
        'sans-semibold': ['NotoSansArabic_600SemiBold', 'sans-serif'],
        // Legacy aliases kept so existing screens keep compiling; they now
        // resolve to Noto Sans Arabic (Naskh is gone).
        arabic: ['NotoSansArabic_400Regular', 'sans-serif'],
        'arabic-bold': ['NotoSansArabic_600SemiBold', 'sans-serif'],
      },
      // shadow/floating — dialogs, sheets and toasts only; cards use a 1px border/default.
      boxShadow: {
        floating: '0 12px 32px -8px rgba(27, 36, 32, 0.10)',
        card: '0 1px 2px rgba(27, 36, 32, 0.04), 0 8px 24px -4px rgba(27, 36, 32, 0.06)',
      },
    },
  },
  plugins: [],
};
