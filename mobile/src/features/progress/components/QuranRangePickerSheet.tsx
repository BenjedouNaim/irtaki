import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useSurahs } from '../hooks/useSurahs';
import {
  AyahPosition,
  AyahRange,
  buildSurahIndex,
  formatAyahPosition,
  formatAyahRange,
  isAyahDisabledForTo,
} from '../utils/ayahRange';
import { SurahDto } from '../../../shared/api/quran.client';
import { SurahSearchList } from './SurahSearchList';
import { AyahWheel } from './AyahWheel';
import { Banner } from '../../../shared/components/Banner';
import { Button } from '../../../shared/components/Button';
import { Icon } from '../../../shared/components/Icon';
import { SheetHandle } from '../../../shared/components/SheetHandle';
import { SkeletonLoader } from '../../../shared/components/SkeletonLoader';
import { typography } from '../../../shared/theme/typography';
import { itemsStart, rowStart } from '../../../shared/theme/rtl';

export type QuranRangePickerStep =
  'from-surah' | 'from-ayah' | 'to-surah' | 'to-ayah';

export interface QuranRangePickerSheetProps {
  visible: boolean;
  rangeType: 'memorization' | 'revision';
  initialValue?: Partial<AyahRange>;
  onConfirm: (range: AyahRange) => void;
  onCancel: () => void;
  testID?: string;
}

/** Figma SCR-11 step titles (27:483 / 27:597). */
const STEP_TITLES: Record<QuranRangePickerStep, string> = {
  'from-surah': 'من — اختر السورة',
  'from-ayah': 'من — اختر الآية',
  'to-surah': 'إلى — اختر السورة',
  'to-ayah': 'إلى — اختر الآية',
};

const SURAH_STEP_SUBTITLE = 'ترتيب المصحف · اكتب للبحث';
const RANGE_TYPE_LABELS = {
  memorization: 'نطاق الحفظ',
  revision: 'نطاق المراجعة',
} as const;

/** 36px round controls; the slop reaches the 48dp target (UF §32). */
const CONTROL_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

/**
 * SCR-11 Quran Range Picker (F-PRG-06, UF §19; Figma 27:457 / 27:571): a
 * full-screen surface sheet — handle, header (step title + context line,
 * close control on the left, a back control on the right for the earlier
 * steps), the "من" / "إلى" step pills, then the surah search list or the
 * ayah WheelCard with the running range summary and the CTA. FROM surah →
 * ayah → TO surah → ayah; VR-14a disables every TO ayah before FROM.
 */
export function QuranRangePickerSheet({
  visible,
  rangeType,
  initialValue,
  onConfirm,
  onCancel,
  testID = 'quran-range-picker-sheet',
}: QuranRangePickerSheetProps) {
  const { data: surahs, isLoading, isError, refetch } = useSurahs();

  const surahIndex = useMemo(() => buildSurahIndex(surahs || []), [surahs]);

  const [step, setStep] = useState<QuranRangePickerStep>('from-surah');
  const [draftFrom, setDraftFrom] = useState<AyahPosition>({
    surah: 1,
    ayah: 1,
  });
  const [draftTo, setDraftTo] = useState<AyahPosition>({
    surah: 1,
    ayah: 1,
  });

  // Reset/seed state when sheet becomes visible
  useEffect(() => {
    if (visible) {
      setStep('from-surah');
      const seededFrom: AyahPosition = {
        surah: initialValue?.from?.surah ?? 1,
        ayah: initialValue?.from?.ayah ?? 1,
      };
      const seededTo: AyahPosition = {
        surah: initialValue?.to?.surah ?? seededFrom.surah,
        ayah: initialValue?.to?.ayah ?? seededFrom.ayah,
      };
      setDraftFrom(seededFrom);
      setDraftTo(seededTo);
    }
  }, [visible, initialValue]);

  const triggerHaptic = useCallback(() => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.selectionAsync();
      } catch {
        // Fallback for environments without haptics
      }
    }
  }, []);

  const handleBack = useCallback(() => {
    triggerHaptic();
    if (step === 'from-surah') {
      onCancel();
    } else if (step === 'from-ayah') {
      setStep('from-surah');
    } else if (step === 'to-surah') {
      setStep('from-ayah');
    } else if (step === 'to-ayah') {
      setStep('to-surah');
    }
  }, [step, onCancel, triggerHaptic]);

  const handleSelectFromSurah = useCallback((surah: SurahDto) => {
    setDraftFrom({
      surah: surah.number,
      ayah: 1,
    });
    // Also pre-seed TO surah to match FROM surah
    setDraftTo({
      surah: surah.number,
      ayah: 1,
    });
    setStep('from-ayah');
  }, []);

  const handleNextFromAyah = useCallback(() => {
    triggerHaptic();
    // When moving to TO surah, ensure draftTo is consistent
    if (draftTo.surah < draftFrom.surah) {
      setDraftTo({
        surah: draftFrom.surah,
        ayah: draftFrom.ayah,
      });
    } else if (
      draftTo.surah === draftFrom.surah &&
      draftTo.ayah < draftFrom.ayah
    ) {
      setDraftTo((prev) => ({
        ...prev,
        ayah: draftFrom.ayah,
      }));
    }
    setStep('to-surah');
  }, [draftFrom, draftTo, triggerHaptic]);

  const handleSelectToSurah = useCallback(
    (surah: SurahDto) => {
      setDraftTo((prev) => {
        let nextAyah = prev.ayah;
        if (surah.number === draftFrom.surah) {
          nextAyah = Math.max(prev.ayah, draftFrom.ayah);
        } else if (surah.number > draftFrom.surah) {
          nextAyah = prev.ayah || 1;
        } else {
          nextAyah = 1;
        }
        return {
          surah: surah.number,
          ayah: nextAyah,
        };
      });
      setStep('to-ayah');
    },
    [draftFrom],
  );

  const handleConfirm = useCallback(() => {
    triggerHaptic();
    onConfirm({
      from: { surah: draftFrom.surah, ayah: draftFrom.ayah },
      to: { surah: draftTo.surah, ayah: draftTo.ayah },
    });
  }, [draftFrom, draftTo, onConfirm, triggerHaptic]);

  const fromSurah = surahIndex.get(draftFrom.surah);
  const toSurah = surahIndex.get(draftTo.surah);
  const isFromStep = step === 'from-surah' || step === 'from-ayah';
  const fromDone = !isFromStep;

  const stepSubtitle = useMemo(() => {
    switch (step) {
      case 'from-surah':
      case 'to-surah':
        return `${RANGE_TYPE_LABELS[rangeType]} · ${SURAH_STEP_SUBTITLE}`;
      case 'from-ayah':
        return fromSurah
          ? `${fromSurah.name_ar} · ${fromSurah.ayah_count} آية`
          : RANGE_TYPE_LABELS[rangeType];
      case 'to-ayah': {
        if (!toSurah) return RANGE_TYPE_LABELS[rangeType];
        const base = `${toSurah.name_ar} · ${toSurah.ayah_count} آية`;
        return toSurah.number === draftFrom.surah
          ? `${base} · ما قبل الآية ${draftFrom.ayah} معطّل`
          : base;
      }
    }
  }, [step, rangeType, fromSurah, toSurah, draftFrom]);

  const isToAyahDisabled = useMemo(() => {
    if (step !== 'to-ayah') return false;
    return isAyahDisabledForTo(surahIndex, draftFrom, draftTo);
  }, [step, surahIndex, draftFrom, draftTo]);

  const fromSummary = fromSurah
    ? formatAyahPosition(surahIndex, draftFrom)
    : null;
  const rangeSummary =
    step === 'to-ayah' && fromSurah && toSurah
      ? formatAyahRange(surahIndex, { from: draftFrom, to: draftTo })
      : fromSummary;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
      testID={testID}
    >
      <SafeAreaView className="flex-1 bg-surface dark:bg-surface-dark">
        <SheetHandle />

        {/* Header: titles on the reading side, close on the trailing side */}
        <View
          testID={`${testID}-header`}
          className={`${rowStart} items-center justify-between gap-3 px-4 pb-3`}
        >
          <View className={`${rowStart} items-center gap-3 flex-1`}>
            <Pressable
              testID={`${testID}-back-button`}
              onPress={handleBack}
              hitSlop={CONTROL_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={step === 'from-surah' ? 'إغلاق' : 'رجوع'}
              className="w-9 h-9 rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center active:opacity-80"
            >
              <Icon name="chevron-right" size={18} tone="primary" />
            </Pressable>
            <View className={`flex-1 ${itemsStart}`}>
              <Text
                testID={`${testID}-title`}
                numberOfLines={1}
                className={`w-full ${typography.headingMd} text-right text-fg dark:text-fg-dark`}
                accessibilityRole="header"
              >
                {STEP_TITLES[step]}
              </Text>
              <Text
                testID={`${testID}-step-subtitle`}
                numberOfLines={1}
                className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
              >
                {stepSubtitle}
              </Text>
            </View>
          </View>

          <Pressable
            testID={`${testID}-close-button`}
            onPress={onCancel}
            hitSlop={CONTROL_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="إلغاء وإغلاق"
            className="w-9 h-9 rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center active:opacity-80"
          >
            <Icon name="x" size={18} tone="primary" />
          </Pressable>
        </View>

        {/* Step pills: "من" first (rightmost), "إلى" second */}
        <View className={`${rowStart} items-start gap-2 px-4 pb-3`}>
          <View
            testID={`${testID}-step-from`}
            accessibilityState={{ selected: isFromStep }}
            className={`flex-1 ${rowStart} items-center justify-center gap-1.5 px-3 py-1.5 rounded-full ${
              isFromStep
                ? 'bg-primary dark:bg-primary-dark'
                : 'bg-subtle dark:bg-subtle-dark'
            }`}
          >
            {fromDone ? <Icon name="check" size={14} tone="success" /> : null}
            <Text
              testID={`${testID}-summary-from`}
              numberOfLines={1}
              className={`${typography.labelSm} text-right ${
                isFromStep ? 'text-fg-on-primary' : 'text-fg-success'
              }`}
            >
              {fromDone && fromSummary ? `من · ${fromSummary}` : 'من'}
            </Text>
          </View>
          <View
            testID={`${testID}-step-to`}
            accessibilityState={{ selected: !isFromStep }}
            className={`flex-1 items-center justify-center px-3 py-1.5 rounded-full ${
              isFromStep
                ? 'bg-subtle dark:bg-subtle-dark'
                : 'bg-primary dark:bg-primary-dark'
            }`}
          >
            <Text
              testID={`${testID}-summary-to`}
              numberOfLines={1}
              className={`${typography.labelSm} text-right ${
                isFromStep
                  ? 'text-fg-secondary dark:text-fg-secondary-dark'
                  : 'text-fg-on-primary'
              }`}
            >
              إلى
            </Text>
          </View>
        </View>

        {/* Content Body */}
        <View className="flex-1 w-full px-4">
          {isLoading && !surahs ? (
            /* First load skeleton (UF §22: brief, first-ever use only) */
            <View testID={`${testID}-skeleton`} className="flex-1 pt-1">
              <SkeletonLoader count={8} />
            </View>
          ) : isError && !surahs ? (
            <Banner
              tone="error"
              message="حدث خطأ أثناء تحميل بيانات السور"
              onRetry={() => refetch()}
              testID={`${testID}-error`}
            />
          ) : surahs ? (
            /* State Machine Stages */
            <View className="flex-1 gap-5">
              {step === 'from-surah' && (
                <SurahSearchList
                  surahs={surahs}
                  selectedSurahNumber={draftFrom.surah}
                  onSelectSurah={handleSelectFromSurah}
                  testID={`${testID}-from-surah-list`}
                />
              )}

              {step === 'from-ayah' && fromSurah && (
                <>
                  <AyahWheel
                    surah={fromSurah}
                    surahIndex={surahIndex}
                    selectedAyah={draftFrom.ayah}
                    onSelectAyah={(ayah) =>
                      setDraftFrom((prev) => ({ ...prev, ayah }))
                    }
                    testID={`${testID}-from-ayah-wheel`}
                  />
                  <RangeSummary
                    label="من"
                    value={rangeSummary}
                    testID={`${testID}-summary`}
                  />
                  <View className="flex-1" />
                  <Button
                    label="التالي"
                    variant="primary"
                    onPress={handleNextFromAyah}
                    testID={`${testID}-next-button`}
                    className="w-full mb-6"
                  />
                </>
              )}

              {step === 'to-surah' && (
                <SurahSearchList
                  surahs={surahs}
                  selectedSurahNumber={draftTo.surah}
                  onSelectSurah={handleSelectToSurah}
                  testID={`${testID}-to-surah-list`}
                />
              )}

              {step === 'to-ayah' && toSurah && (
                <>
                  <AyahWheel
                    surah={toSurah}
                    surahIndex={surahIndex}
                    fromPosition={draftFrom}
                    selectedAyah={draftTo.ayah}
                    onSelectAyah={(ayah) =>
                      setDraftTo((prev) => ({ ...prev, ayah }))
                    }
                    testID={`${testID}-to-ayah-wheel`}
                  />
                  <RangeSummary
                    label="النطاق"
                    value={rangeSummary}
                    testID={`${testID}-summary`}
                  />
                  {isToAyahDisabled && (
                    <View
                      testID={`${testID}-vr14a-warning`}
                      accessibilityRole="alert"
                      className={`${rowStart} items-center gap-1.5 w-full`}
                    >
                      <Icon
                        name="alert"
                        size={16}
                        tone="error"
                        accessibilityLabel="تنبيه"
                      />
                      <Text
                        className={`flex-1 ${typography.bodySm} text-right text-fg-error`}
                      >
                        يجب أن تكون نهاية النطاق بعد بدايته في ترتيب المصحف
                      </Text>
                    </View>
                  )}
                  <View className="flex-1" />
                  <Button
                    label="تأكيد النطاق"
                    variant="primary"
                    disabled={isToAyahDisabled}
                    onPress={handleConfirm}
                    testID={`${testID}-confirm-button`}
                    className="w-full mb-6"
                  />
                </>
              )}
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** Figma "Summary" strip (27:625): primary-subtle pill — caption + the range in text/brand. */
function RangeSummary({
  label,
  value,
  testID,
}: {
  label: string;
  value: string | null;
  testID: string;
}) {
  if (!value) return null;
  return (
    <View
      testID={testID}
      className={`w-full ${rowStart} items-center gap-2 px-4 py-3 rounded-md bg-primary-subtle dark:bg-primary-subtle-dark`}
      style={{ borderCurve: 'continuous' }}
    >
      <Text
        className={`${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {label}
      </Text>
      <Text
        testID={`${testID}-value`}
        numberOfLines={1}
        className={`flex-1 ${typography.bodyMdMedium} text-right text-brand dark:text-brand-dark`}
      >
        {value}
      </Text>
    </View>
  );
}
