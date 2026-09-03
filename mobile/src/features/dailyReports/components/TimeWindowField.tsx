import React, { useState } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { FormField } from '@/shared/components/FormField';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { SheetHandle } from '@/shared/components/SheetHandle';
import { WheelPicker } from '@/shared/components/WheelPicker';
import { typography } from '@/shared/theme/typography';
import { SHADOW_FLOATING } from '@/shared/theme/colors';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
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

const BOUND_CAPTIONS = { from: 'من', to: 'إلى' } as const;
const EMPTY_TIME = '--:--';

function split(time: string | null): { hour: number; minute: number } {
  if (!time) {
    return { hour: 18, minute: 0 };
  }
  const [h, m] = time.split(':').map(Number);
  return { hour: h, minute: m };
}

/**
 * VO-03 TimeWindow entry (Figma SCR-10 "Times"): label/md field label, then
 * two surface triggers side by side — "من 05:50" (right) and "إلى 06:40"
 * (left), each with a clock glyph — opening a bottom sheet with an hour and
 * a minute WheelPicker (19:88; UF §31 "wheel pickers are direction-agnostic").
 * Western numerals, `HH:MM` on the wire.
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

  const trigger = (bound: 'from' | 'to') => {
    const caption = BOUND_CAPTIONS[bound];
    const filled = Boolean(value[bound]);
    return (
      <Pressable
        testID={`${testID}-${bound}`}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${caption}${value[bound] ? ` ${value[bound]}` : ''}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => open(bound)}
        className={`flex-1 min-h-[52px] ${rowStart} items-center justify-between px-3.5 py-3 gap-2 rounded-md active:opacity-80 ${
          error
            ? 'border-[1.5px] border-line-error'
            : 'border border-line dark:border-line-dark'
        } ${
          disabled
            ? 'bg-subtle dark:bg-subtle-dark'
            : 'bg-surface dark:bg-surface-dark'
        }`}
        style={{ borderCurve: 'continuous' }}
      >
        <View className={`${rowStart} items-center gap-1.5`}>
          <Text
            className={`${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            {caption}
          </Text>
          <Text
            testID={`${testID}-${bound}-value`}
            className={`${typography.bodyLg} text-right ${
              disabled
                ? 'text-fg-disabled'
                : filled
                  ? 'text-fg dark:text-fg-dark'
                  : 'text-fg-tertiary dark:text-fg-tertiary-dark'
            }`}
            maxFontSizeMultiplier={1.4}
          >
            {value[bound] ?? EMPTY_TIME}
          </Text>
        </View>
        <Icon name="clock" size={18} tone={filled ? 'secondary' : 'tertiary'} />
      </Pressable>
    );
  };

  return (
    <FormField
      label={label}
      required={required}
      error={error}
      disabled={disabled}
      testID={testID}
      className="mb-0"
    >
      <View className={`${rowStart} gap-3`}>
        {trigger('from')}
        {trigger('to')}
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
            className={`bg-surface dark:bg-surface-dark rounded-t-xl px-4 pb-6 gap-4 ${itemsStart}`}
            style={[SHADOW_FLOATING, { borderCurve: 'continuous' }]}
          >
            <SheetHandle />
            <Text
              className={`w-full ${typography.headingMd} text-right text-fg dark:text-fg-dark`}
              accessibilityRole="header"
            >
              {label} — {editing ? BOUND_CAPTIONS[editing] : ''}
            </Text>
            <View
              className="w-full rounded-xl bg-canvas dark:bg-canvas-dark py-5 items-center"
              style={{ borderCurve: 'continuous' }}
            >
              <View className={`${rowStart} items-center gap-4`}>
                <View className="w-[120px] items-center gap-1">
                  <Text
                    className={`${typography.labelSm} text-center text-fg-secondary dark:text-fg-secondary-dark`}
                  >
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
                <Text
                  className={`${typography.headingMd} text-fg-secondary dark:text-fg-secondary-dark`}
                >
                  :
                </Text>
                <View className="w-[120px] items-center gap-1">
                  <Text
                    className={`${typography.labelSm} text-center text-fg-secondary dark:text-fg-secondary-dark`}
                  >
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
