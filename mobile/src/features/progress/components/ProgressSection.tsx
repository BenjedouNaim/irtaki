import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { CompletionRing } from '@/shared/components/CompletionRing';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { Button } from '@/shared/components/Button';
import { ApiError } from '@/shared/api/types';
import { AyahPositionDto } from '@/shared/api/progress.client';
import { useMyProgress } from '../hooks/useMyProgress';
import { useSurahs } from '../hooks/useSurahs';

export interface ProgressSectionProps {
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من الاتصال بالإنترنت والمحاولة مجدداً.';

function describePosition(
  position: AyahPositionDto,
  surahName: string | undefined,
): string {
  const surahLabel = surahName
    ? `سورة ${surahName}`
    : `السورة رقم ${position.surah}`;
  return `${surahLabel} · الآية ${position.ayah}`;
}

/**
 * Standalone "Memorization Progress" section of SCR-13 (F-PRG-02, UF §17).
 *
 * Renders the ahzab-completed completion ring (a real count) and the last-worked-on
 * position as PLAIN TEXT. `last_memorized_position` is an activity pointer under
 * non-linear memorization (DEC-D02) and is NEVER rendered as a progress bar — the
 * pointer block is only rendered when the payload itself carries
 * `is_activity_pointer_only: true` (APIS §10.10).
 *
 * The full SCR-13 (score, day-breakdown donut, quality, attendance) belongs to EPIC-06,
 * which assembles the screen around this component.
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
        testID={`${testID}-skeleton`}
        className={`w-full ${className ?? ''}`}
        style={style}
      >
        <SkeletonLoader
          variant="dashboard"
          testID={`${testID}-skeleton-loader`}
        />
      </View>
    );
  }

  if (isError || !data) {
    const message =
      error instanceof ApiError
        ? error.message || 'تعذر تحميل بيانات التقدم'
        : NETWORK_ERROR_MESSAGE;

    return (
      <View
        testID={`${testID}-error`}
        className={`w-full bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-xl p-5 ${
          className ?? ''
        }`}
        style={[{ borderCurve: 'continuous' }, style]}
      >
        <Text className="text-destructive-800 dark:text-destructive-200 text-base font-semibold text-center mb-2">
          خطأ في تحميل البيانات
        </Text>
        <Text
          className="text-destructive-700 dark:text-destructive-300 text-sm text-center leading-relaxed mb-4"
          testID={`${testID}-error-message`}
        >
          {message}
        </Text>
        <Button
          label="إعادة المحاولة"
          variant="outline"
          onPress={() => void refetch()}
          testID={`${testID}-retry-button`}
        />
      </View>
    );
  }

  const position = data.last_memorized_position;
  const surahName = position
    ? surahs?.find((s) => s.number === position.surah)?.name_ar
    : undefined;

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      className={`w-full p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm gap-5 ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <Text
        className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right"
        testID={`${testID}-title`}
      >
        التقدم في الحفظ
      </Text>

      <View className="items-center">
        <CompletionRing
          completed={data.ahzab_completed}
          label="حزباً مكتملاً"
          testID={`${testID}-ring`}
        />
      </View>

      {data.is_activity_pointer_only === true ? (
        <View className="gap-2" testID={`${testID}-pointer`}>
          {position ? (
            <Text
              className="text-base text-gray-900 dark:text-gray-100 text-right"
              testID={`${testID}-pointer-text`}
            >
              آخر موضع تم العمل عليه: {describePosition(position, surahName)}
            </Text>
          ) : (
            <Text
              className="text-base text-gray-600 dark:text-gray-400 text-right"
              testID={`${testID}-pointer-empty`}
            >
              لم يُسجَّل أي موضع حفظ بعد
            </Text>
          )}

          <View
            className="bg-info-50 dark:bg-info-950 border border-info-200 dark:border-info-800 rounded-lg px-3 py-2"
            style={{ borderCurve: 'continuous' }}
            testID={`${testID}-pointer-disclaimer`}
          >
            <Text className="text-xs text-info-700 dark:text-info-300 text-right leading-relaxed">
              يشير هذا الموضع إلى آخر نشاط حفظ فقط، ولا يعبّر عن نسبة التقدم.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
