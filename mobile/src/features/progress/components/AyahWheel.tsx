import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { WheelPicker, WheelPickerItem } from '../../../shared/components/WheelPicker';
import { SurahDto } from '../../../shared/api/quran.client';
import {
  AyahPosition,
  isAyahDisabledForTo,
} from '../utils/ayahRange';

export interface AyahWheelProps {
  surah: SurahDto;
  surahIndex: Map<number, SurahDto>;
  fromPosition?: AyahPosition;
  selectedAyah?: number;
  onSelectAyah: (ayah: number) => void;
  testID?: string;
}

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
    <View className="w-full gap-4 items-center" testID={testID}>
      <View className="items-center gap-1">
        <Text
          className="text-lg font-bold text-gray-900 dark:text-gray-100"
          testID={`${testID}-surah-title`}
        >
          سورة {surah.name_ar}
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          عدد الآيات: {surah.ayah_count}
        </Text>
      </View>

      <WheelPicker
        items={items}
        selectedValue={selectedAyah}
        onValueChange={(val) => onSelectAyah(Number(val))}
        testID={`${testID}-picker`}
      />
    </View>
  );
}
