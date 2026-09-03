import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import {
  WheelPicker,
  WheelPickerItem,
} from '../../../shared/components/WheelPicker';
import { SurahDto } from '../../../shared/api/quran.client';
import { typography } from '../../../shared/theme/typography';
import { rowStart } from '../../../shared/theme/rtl';
import { AyahPosition, isAyahDisabledForTo } from '../utils/ayahRange';

export interface AyahWheelProps {
  surah: SurahDto;
  surahIndex: Map<number, SurahDto>;
  fromPosition?: AyahPosition;
  selectedAyah?: number;
  onSelectAyah: (ayah: number) => void;
  testID?: string;
}

/**
 * Figma SCR-11 ayah step "WheelCard" (27:607): a canvas-toned card holding
 * the "الآية" label (right) and a 120px WheelPicker (19:88) over
 * 1..ayah_count. Options before the FROM ordinal render disabled (VR-14a).
 * The surah name and count live in the sheet header.
 */
export function AyahWheel({
  surah,
  surahIndex,
  fromPosition,
  selectedAyah,
  onSelectAyah,
  testID = 'ayah-wheel',
}: AyahWheelProps) {
  const items: WheelPickerItem[] = useMemo(() => {
    return Array.from({ length: surah.ayah_count }, (_, i) => {
      const ayahNumber = i + 1;
      const disabled = isAyahDisabledForTo(surahIndex, fromPosition, {
        surah: surah.number,
        ayah: ayahNumber,
      });

      return {
        label: String(ayahNumber),
        value: ayahNumber,
        disabled,
      };
    });
  }, [surah.ayah_count, surah.number, surahIndex, fromPosition]);

  return (
    <View
      className="w-full py-5 items-center justify-center rounded-xl bg-canvas dark:bg-canvas-dark"
      style={{ borderCurve: 'continuous' }}
      testID={testID}
      accessibilityLabel={`سورة ${surah.name_ar}، عدد الآيات ${surah.ayah_count}`}
    >
      <View className={`${rowStart} items-center gap-6`}>
        <Text
          className={`${typography.labelLg} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          testID={`${testID}-label`}
        >
          الآية
        </Text>
        <View className="w-[120px]">
          <WheelPicker
            items={items}
            selectedValue={selectedAyah}
            onValueChange={(val) => onSelectAyah(Number(val))}
            testID={`${testID}-picker`}
          />
        </View>
      </View>
    </View>
  );
}
