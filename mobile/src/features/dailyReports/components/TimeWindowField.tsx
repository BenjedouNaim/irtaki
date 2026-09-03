import React, { useState } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { FormField } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import { WheelPicker } from '@/shared/components/WheelPicker';
import { TimeWindowDraft } from '../utils/dailyReportForm';

export interface TimeWindowFieldProps {
  label: string;
  value: TimeWindowDraft;
  onChange: (value: TimeWindowDraft) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  testID?: string;
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  label: String(h).padStart(2, '0'),
  value: h,
}));
const MINUTES = Array.from({ length: 60 }, (_, m) => ({
  label: String(m).padStart(2, '0'),
  value: m,
}));

function split(time: string | null): { hour: number; minute: number } {
  if (!time) {
    return { hour: 18, minute: 0 };
  }
  const [h, m] = time.split(':').map(Number);
  return { hour: h, minute: m };
}

/**
 * VO-03 TimeWindow entry (UF §20 "Time: above wheel trigger"): two triggers
 * (from / to) each opening a wheel sheet (hour + minute, UF §31 "wheel
 * pickers are direction-agnostic"). Western numerals, `HH:MM` on the wire.
 */
export function TimeWindowField({
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  testID = 'time-window-field',
}: TimeWindowFieldProps) {
  const [editing, setEditing] = useState<'from' | 'to' | null>(null);
  const [draft, setDraft] = useState({ hour: 18, minute: 0 });

  const open = (bound: 'from' | 'to') => {
    setDraft(split(value[bound]));
    setEditing(bound);
  };

  const confirm = () => {
    if (!editing) return;
    const time = `${String(draft.hour).padStart(2, '0')}:${String(
      draft.minute,
    ).padStart(2, '0')}`;
    onChange({ ...value, [editing]: time });
    setEditing(null);
  };

  const trigger = (bound: 'from' | 'to', caption: string) => (
    <Pressable
      testID={`${testID}-${bound}`}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${caption}${value[bound] ? ` ${value[bound]}` : ''}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => open(bound)}
      className={`flex-1 min-h-[48px] flex-row-reverse items-center justify-between px-4 rounded-xl border ${
        error ? 'border-destructive' : 'border-gray-200 dark:border-gray-800'
      } ${disabled ? 'bg-gray-100 dark:bg-gray-800 opacity-60' : 'bg-white dark:bg-gray-900'}`}
      style={{ borderCurve: 'continuous' }}
    >
      <Text className="text-sm text-gray-500 dark:text-gray-400">
        {caption}
      </Text>
      <Text
        testID={`${testID}-${bound}-value`}
        className={`text-base font-semibold ${
          value[bound]
            ? 'text-gray-900 dark:text-gray-100'
            : 'text-gray-400 dark:text-gray-600'
        }`}
        maxFontSizeMultiplier={1.4}
      >
        {value[bound] ?? '--:--'}
      </Text>
    </Pressable>
  );

  return (
    <FormField label={label} required={required} error={error} testID={testID}>
      <View className="flex-row-reverse gap-3">
        {trigger('from', 'من')}
        {trigger('to', 'إلى')}
      </View>

      <Modal
        visible={editing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
        testID={`${testID}-sheet`}
      >
        <View className="flex-1 justify-end">
          <Pressable
            testID={`${testID}-sheet-backdrop`}
            className="absolute inset-0 bg-black/50"
            onPress={() => setEditing(null)}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
          />
          <View
            className="bg-white dark:bg-gray-900 rounded-t-3xl p-5 gap-4"
            style={{ borderCurve: 'continuous' }}
          >
            <Text
              className="text-base font-bold text-gray-900 dark:text-gray-100 text-right"
              accessibilityRole="header"
            >
              {label} — {editing === 'from' ? 'من' : 'إلى'}
            </Text>
            <View className="flex-row-reverse gap-3 items-center">
              <View className="flex-1 gap-1">
                <Text className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  الساعة
                </Text>
                <WheelPicker
                  items={HOURS}
                  selectedValue={draft.hour}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, hour: Number(v) }))
                  }
                  testID={`${testID}-hour-wheel`}
                />
              </View>
              <Text className="text-xl font-bold text-gray-700 dark:text-gray-300">
                :
              </Text>
              <View className="flex-1 gap-1">
                <Text className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  الدقيقة
                </Text>
                <WheelPicker
                  items={MINUTES}
                  selectedValue={draft.minute}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, minute: Number(v) }))
                  }
                  testID={`${testID}-minute-wheel`}
                />
              </View>
            </View>
            <Button
              label="تأكيد"
              onPress={confirm}
              testID={`${testID}-confirm-button`}
              className="w-full"
            />
          </View>
        </View>
      </Modal>
    </FormField>
  );
}
