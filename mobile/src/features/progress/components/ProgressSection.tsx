import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Banner } from '@/shared/components/Banner';
import {
  CompletionRing,
  METRIC_MAX_FONT_SIZE_MULTIPLIER,
  TOTAL_AHZAB,
} from '@/shared/components/CompletionRing';
import { Icon } from '@/shared/components/Icon';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { ApiError } from '@/shared/api/types';
import { AyahPositionDto } from '@/shared/api/progress.client';
import { useMyProgress } from '@/features/progress/hooks/useMyProgress';
import { useSurahs } from '@/features/progress/hooks/useSurahs';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';

export interface ProgressSectionProps {
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل بيانات التقدم';

/** DEC-D02: the pointer is an activity marker, never a share of progress. */
const POINTER_DISCLAIMER =
  'يشير هذا الموضع إلى آخر نشاط حفظ فقط، ولا يعبّر عن نسبة التقدم.';

/**
 * Maps a query error to the user-facing Arabic message per UF §24's table.
 *
 * - Network unavailable → generic connectivity copy.
 * - `5xx` → generic retry copy; the server string is never shown (no internal detail ever).
 * - `401` is refreshed silently by the API client and never reaches here; `403`/`404` are
 *   unreachable by navigation; `409`/`422`/`429` do not apply to this read. Any remaining
 *   `4xx` carries the exception filter's Arabic message, shown verbatim like other screens.
 */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      return SERVER_ERROR_MESSAGE;
    }
    return error.message || SERVER_ERROR_MESSAGE;
  }
  return NETWORK_ERROR_MESSAGE;
}

/** Figma "آخر موضع: البقرة 101" — surah number while the reference data is unavailable. */
function describePosition(
  position: AyahPositionDto,
  surahName: string | undefined,
): string {
  return `${surahName ?? `سورة ${position.surah}`} ${position.ayah}`;
}

/**
 * "تقدّم الحفظ" card of SCR-13 (F-PRG-02, UF §17; Figma 30:603): title,
 * then a row with the text column on the reading side — "الأحزاب المكتملة",
 * "23 من 60" and the last-worked-on position as PLAIN TEXT with an info
 * glyph — and the CompletionRing on the far side. `last_memorized_position`
 * is an activity pointer under non-linear memorization (DEC-D02) and is
 * NEVER rendered as a progress bar. The payload's `is_activity_pointer_only`
 * is always `true` (APIS §10.10) and is not used as a rendering switch.
 */
export function ProgressSection({
  testID = 'progress-section',
  className,
  style,
}: ProgressSectionProps) {
  const { data, isLoading, isError, error, refetch } = useMyProgress();
  const { data: surahs } = useSurahs();

  if (isLoading && !data) {
    return (
      <View
        key="skeleton"
        testID={`${testID}-skeleton`}
        className={`w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${
          className ?? ''
        }`}
        style={[{ borderCurve: 'continuous' }, style]}
      >
        <SkeletonLoader variant="ring" testID={`${testID}-skeleton-loader`} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <Banner
        key="error"
        tone="error"
        message={describeError(error)}
        onRetry={() => void refetch()}
        testID={`${testID}-error`}
        className={className}
        style={style}
      />
    );
  }

  const position = data.last_memorized_position;
  const surahName = position
    ? surahs?.find((s) => s.number === position.surah)?.name_ar
    : undefined;

  return (
    <View
      key="data"
      testID={testID}
      accessibilityRole="summary"
      className={`w-full p-5 gap-4 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${itemsStart} ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <Text
        className={`w-full ${typography.headingSm} text-right text-fg dark:text-fg-dark`}
        accessibilityRole="header"
        testID={`${testID}-title`}
      >
        تقدّم الحفظ
      </Text>

      <View className={`w-full ${rowStart} items-center justify-between gap-4`}>
        <View className={`flex-1 gap-1.5 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            الأحزاب المكتملة
          </Text>
          <Text
            className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
            testID={`${testID}-count`}
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
          >
            {`${data.ahzab_completed} من ${TOTAL_AHZAB}`}
          </Text>
          <View
            className={`${rowStart} items-center gap-1.5 w-full`}
            testID={`${testID}-pointer`}
          >
            {position ? (
              <>
                <Text
                  className={`flex-shrink ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                  testID={`${testID}-pointer-text`}
                  maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
                >
                  {`آخر موضع: ${describePosition(position, surahName)}`}
                </Text>
                <Icon
                  name="info"
                  size={14}
                  tone="tertiary"
                  accessibilityLabel={POINTER_DISCLAIMER}
                  testID={`${testID}-pointer-disclaimer`}
                />
              </>
            ) : (
              <Text
                className={`flex-1 ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                testID={`${testID}-pointer-empty`}
                maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
              >
                لم يُسجَّل أي موضع حفظ بعد
              </Text>
            )}
          </View>
        </View>

        <CompletionRing
          completed={data.ahzab_completed}
          label="حزباً مكتملاً"
          testID={`${testID}-ring`}
        />
      </View>
    </View>
  );
}
