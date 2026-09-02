import React, { useMemo, useState } from 'react';
import { Text, Pressable } from 'react-native';
import { FormField } from '@/shared/components/FormField';
import { AyahRangeDto } from '@/shared/api/dailyReports.client';
import { QuranRangePickerSheet } from '@/features/progress/components/QuranRangePickerSheet';
import { useSurahs } from '@/features/progress/hooks/useSurahs';
import { buildSurahIndex } from '@/features/progress/utils/ayahRange';

export interface QuranRangeFieldProps {
  label: string;
  rangeType: 'memorization' | 'revision';
  value: AyahRangeDto | null;
  onChange: (value: AyahRangeDto) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  testID?: string;
}

/**
 * Quran range selector (UF §20): a summary-chip trigger above which the
 * label sits, opening the shared SCR-11 Quran Range Picker (F-PRG-06). The
 * field stays empty if the sheet is closed incomplete; VR-14a is enforced
 * inside the sheet ("To" cannot precede "From").
 */
export function QuranRangeField({
  label,
  rangeType,
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  testID = 'quran-range-field',
}: QuranRangeFieldProps) {
  const [open, setOpen] = useState(false);
  const { data: surahs } = useSurahs();
  const surahIndex = useMemo(() => buildSurahIndex(surahs ?? []), [surahs]);

  const describe = (position: { surah: number; ayah: number }): string => {
    const name = surahIndex.get(position.surah)?.name_ar;
    return `${name ? `سورة ${name}` : `سورة ${position.surah}`} آية ${position.ayah}`;
  };

  const summary = value
    ? `من ${describe(value.from)} إلى ${describe(value.to)}`
    : 'اضغط لاختيار النطاق';

  return (
    <FormField label={label} required={required} error={error} testID={testID}>
      <Pressable
        testID={`${testID}-trigger`}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${summary}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`min-h-[48px] justify-center px-4 py-3 rounded-xl border ${
          error ? 'border-destructive' : 'border-gray-200 dark:border-gray-800'
        } ${
          disabled
            ? 'bg-gray-100 dark:bg-gray-800 opacity-60'
            : 'bg-white dark:bg-gray-900'
        }`}
        style={{ borderCurve: 'continuous' }}
      >
        <Text
          testID={`${testID}-summary`}
          className={`text-base text-right ${
            value
              ? 'font-semibold text-gray-900 dark:text-gray-100'
              : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          {summary}
        </Text>
      </Pressable>

      <QuranRangePickerSheet
        visible={open}
        rangeType={rangeType}
        initialValue={value ?? undefined}
        onConfirm={(range) => {
          onChange(range);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
        testID={`${testID}-sheet`}
      />
    </FormField>
  );
}
