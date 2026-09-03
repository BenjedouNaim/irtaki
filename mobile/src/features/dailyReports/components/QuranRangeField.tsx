import React, { useMemo, useState } from 'react';
import { FormField } from '@/shared/components/FormField';
import { RangeTrigger } from '@/shared/components/RangeTrigger';
import { AyahRangeDto } from '@/shared/api/dailyReports.client';
import { QuranRangePickerSheet } from '@/features/progress/components/QuranRangePickerSheet';
import { useSurahs } from '@/features/progress/hooks/useSurahs';
import {
  buildSurahIndex,
  formatAyahRange,
} from '@/features/progress/utils/ayahRange';

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
 * Quran range selector (UF §20): a FormField label over the Figma
 * RangeTrigger (19:117) — "البقرة 82 ← البقرة 101" when filled, "اختر
 * النطاق" when empty — opening the shared SCR-11 Quran Range Picker
 * (F-PRG-06). The field stays empty if the sheet is closed incomplete;
 * VR-14a is enforced inside the sheet ("To" cannot precede "From").
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

  const summary = value ? formatAyahRange(surahIndex, value) : null;

  return (
    <FormField
      label={label}
      required={required}
      error={error}
      disabled={disabled}
      testID={testID}
      className="mb-0"
    >
      <RangeTrigger
        value={summary}
        onPress={() => setOpen(true)}
        disabled={disabled}
        error={Boolean(error)}
        accessibilityLabel={`${label}: ${summary ?? 'اختر النطاق'}`}
        testID={`${testID}-trigger`}
      />

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
