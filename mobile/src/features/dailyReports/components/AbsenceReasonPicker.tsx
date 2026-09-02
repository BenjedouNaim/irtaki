import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { AbsenceReason } from '@/shared/api/dailyReports.client';

export interface AbsenceReasonPickerProps {
  value: AbsenceReason | null;
  onChange: (value: AbsenceReason) => void;
  disabled?: boolean;
  error?: string;
  testID?: string;
}

const EXCUSED: Array<{ value: AbsenceReason; label: string }> = [
  { value: 'Sick', label: 'مرض' },
  { value: 'Studying', label: 'دراسة' },
];

/**
 * UF §15 "Absence report form": single-select, required. `Sick` / `Studying`
 * are visually grouped as excused (BR-24); `Other` sits apart with the
 * inline note that it counts as a missed day (BR-25). No free-text field.
 */
export function AbsenceReasonPicker({
  value,
  onChange,
  disabled = false,
  error,
  testID = 'absence-reason-picker',
}: AbsenceReasonPickerProps) {
  const option = (
    reason: AbsenceReason,
    label: string,
    key: string,
    note?: string,
  ) => {
    const selected = value === reason;
    return (
      <Pressable
        key={reason}
        testID={`${testID}-${key}`}
        accessibilityRole="radio"
        accessibilityLabel={`سبب الغياب: ${label}${note ? `. ${note}` : ''}`}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={() => onChange(reason)}
        className={`min-h-[48px] px-4 py-3 rounded-xl border gap-1 ${
          selected
            ? 'border-primary bg-primary-50 dark:bg-primary-950'
            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
        } ${disabled ? 'opacity-50' : ''}`}
        style={{ borderCurve: 'continuous' }}
      >
        <View className="flex-row-reverse items-center gap-2">
          <Text className="text-base">{selected ? '◉' : '○'}</Text>
          <Text
            className={`text-base font-semibold text-right ${
              selected
                ? 'text-primary dark:text-primary-300'
                : 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {label}
          </Text>
        </View>
        {note ? (
          <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
            {note}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View
      className="w-full gap-3"
      testID={testID}
      accessibilityRole="radiogroup"
    >
      <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200 text-right">
        سبب الغياب<Text className="text-destructive font-bold"> *</Text>
      </Text>
      <View className="gap-2 p-3 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
        <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
          غياب بعذر — لا يُحتسب في التقييم الأسبوعي
        </Text>
        {EXCUSED.map((o) => option(o.value, o.label, o.value.toLowerCase()))}
      </View>
      {option('Other', 'سبب آخر', 'other', 'سيُحتسب هذا يوماً فائتاً')}
      {error ? (
        <View
          className="flex-row-reverse items-center gap-1"
          testID={`${testID}-error`}
        >
          <Text className="text-xs" accessibilityLabel="تنبيه">
            ⚠️
          </Text>
          <Text className="text-xs text-destructive text-right">{error}</Text>
        </View>
      ) : null}
    </View>
  );
}
