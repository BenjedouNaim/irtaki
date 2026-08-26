import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  SafeAreaView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSurahs } from '../hooks/useSurahs';
import {
  AyahPosition,
  AyahRange,
  buildSurahIndex,
  isAyahDisabledForTo,
} from '../utils/ayahRange';
import { SurahDto } from '../../../shared/api/quran.client';
import { SurahSearchList } from './SurahSearchList';
import { AyahWheel } from './AyahWheel';
import { Button } from '../../../shared/components/Button';
import { SkeletonLoader } from '../../../shared/components/SkeletonLoader';

export type QuranRangePickerStep =
  | 'from-surah'
  | 'from-ayah'
  | 'to-surah'
  | 'to-ayah';

export interface QuranRangePickerSheetProps {
  visible: boolean;
  rangeType: 'memorization' | 'revision';
  initialValue?: Partial<AyahRange>;
  onConfirm: (range: AyahRange) => void;
  onCancel: () => void;
  testID?: string;
}

export function QuranRangePickerSheet({
  visible,
  rangeType,
  initialValue,
  onConfirm,
  onCancel,
  testID = 'quran-range-picker-sheet',
}: QuranRangePickerSheetProps) {
  const { data: surahs, isLoading, isError, refetch } = useSurahs();

  const surahIndex = useMemo(
    () => buildSurahIndex(surahs || []),
    [surahs],
  );

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

  const handleSelectFromSurah = useCallback(
    (surah: SurahDto) => {
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
    },
    [],
  );

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

  const titleText =
    rangeType === 'memorization' ? 'نطاق الحفظ' : 'نطاق المراجعة';

  const fromSurah = surahIndex.get(draftFrom.surah);
  const toSurah = surahIndex.get(draftTo.surah);

  const stepSubtitle = useMemo(() => {
    switch (step) {
      case 'from-surah':
        return 'من: اختر السورة (1/4)';
      case 'from-ayah':
        return `من: سورة ${fromSurah?.name_ar || ''} (2/4)`;
      case 'to-surah':
        return 'إلى: اختر السورة (3/4)';
      case 'to-ayah':
        return `إلى: سورة ${toSurah?.name_ar || ''} (4/4)`;
    }
  }, [step, fromSurah, toSurah]);

  const isToAyahDisabled = useMemo(() => {
    if (step !== 'to-ayah') return false;
    return isAyahDisabledForTo(surahIndex, draftFrom, draftTo);
  }, [step, surahIndex, draftFrom, draftTo]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
      testID={testID}
    >
      <SafeAreaView className="flex-1 bg-white dark:bg-gray-950">
        {/* Header Bar */}
        <View
          testID={`${testID}-header`}
          className="flex-row-reverse items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
        >
          {/* Back Chevron (Mirrored for RTL) */}
          <Pressable
            testID={`${testID}-back-button`}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={step === 'from-surah' ? 'إغلاق' : 'رجوع'}
            className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800"
          >
            <Text className="text-xl font-bold text-gray-800 dark:text-gray-200">
              →
            </Text>
          </Pressable>

          {/* Title and Step Subtitle */}
          <View className="items-center flex-1 px-2">
            <Text
              testID={`${testID}-title`}
              className="text-base font-bold text-gray-900 dark:text-gray-100 text-center"
            >
              {titleText}
            </Text>
            <Text
              testID={`${testID}-step-subtitle`}
              className="text-xs text-primary dark:text-primary-400 font-medium text-center"
            >
              {stepSubtitle}
            </Text>
          </View>

          {/* Close Button */}
          <Pressable
            testID={`${testID}-close-button`}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="إلغاء وإغلاق"
            className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800"
          >
            <Text className="text-lg font-bold text-gray-500 dark:text-gray-400">
              ✕
            </Text>
          </Pressable>
        </View>

        {/* Selected Range Summary Strip */}
        <View className="flex-row-reverse items-center justify-around py-2.5 px-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
          <View className="flex-row-reverse items-center gap-1.5">
            <Text className="text-xs font-bold text-gray-500 dark:text-gray-400">
              من:
            </Text>
            <Text
              testID={`${testID}-summary-from`}
              className="text-xs font-semibold text-gray-900 dark:text-gray-100"
            >
              {fromSurah ? `سورة ${fromSurah.name_ar} (آية ${draftFrom.ayah})` : '—'}
            </Text>
          </View>

          <Text className="text-xs text-gray-400 dark:text-gray-600">◀</Text>

          <View className="flex-row-reverse items-center gap-1.5">
            <Text className="text-xs font-bold text-gray-500 dark:text-gray-400">
              إلى:
            </Text>
            <Text
              testID={`${testID}-summary-to`}
              className="text-xs font-semibold text-gray-900 dark:text-gray-100"
            >
              {toSurah && (step === 'to-surah' || step === 'to-ayah')
                ? `سورة ${toSurah.name_ar} (آية ${draftTo.ayah})`
                : '—'}
            </Text>
          </View>
        </View>

        {/* Content Body */}
        <View className="flex-1 w-full">
          {isLoading && !surahs ? (
            /* First load skeleton */
            <View
              testID={`${testID}-skeleton`}
              className="flex-1 p-4 gap-3"
            >
              <SkeletonLoader count={8} />
            </View>
          ) : isError && !surahs ? (
            /* Error & Retry Banner */
            <View
              testID={`${testID}-error`}
              className="flex-1 items-center justify-center p-6 gap-4"
            >
              <Text className="text-sm font-semibold text-destructive dark:text-destructive-400 text-center">
                حدث خطأ أثناء تحميل بيانات السور
              </Text>
              <Button
                label="إعادة المحاولة"
                variant="secondary"
                onPress={() => refetch()}
                testID={`${testID}-retry-button`}
              />
            </View>
          ) : surahs ? (
            /* State Machine Stages */
            <View className="flex-1">
              {step === 'from-surah' && (
                <SurahSearchList
                  surahs={surahs}
                  selectedSurahNumber={draftFrom.surah}
                  onSelectSurah={handleSelectFromSurah}
                  testID={`${testID}-from-surah-list`}
                />
              )}

              {step === 'from-ayah' && fromSurah && (
                <View className="flex-1 p-6 justify-between">
                  <View className="flex-1 justify-center">
                    <AyahWheel
                      surah={fromSurah}
                      surahIndex={surahIndex}
                      selectedAyah={draftFrom.ayah}
                      onSelectAyah={(ayah) =>
                        setDraftFrom((prev) => ({ ...prev, ayah }))
                      }
                      testID={`${testID}-from-ayah-wheel`}
                    />
                  </View>
                  <Button
                    label="التالي"
                    variant="primary"
                    onPress={handleNextFromAyah}
                    testID={`${testID}-next-button`}
                    className="w-full"
                  />
                </View>
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
                <View className="flex-1 p-6 justify-between">
                  <View className="flex-1 justify-center gap-3">
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

                    {isToAyahDisabled && (
                      <Text
                        testID={`${testID}-vr14a-warning`}
                        className="text-xs text-destructive dark:text-destructive-400 text-center font-medium"
                      >
                        يجب أن تكون نهاية النطاق بعد بدايته في ترتيب المصحف
                      </Text>
                    )}
                  </View>
                  <Button
                    label="تأكيد"
                    variant="primary"
                    disabled={isToAyahDisabled}
                    onPress={handleConfirm}
                    testID={`${testID}-confirm-button`}
                    className="w-full"
                  />
                </View>
              )}
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
