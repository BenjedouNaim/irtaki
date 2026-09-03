import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Icon } from '@/shared/components/Icon';
import { AbsenceReason } from '@/shared/api/dailyReports.client';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';

export interface AbsenceReasonPickerProps {
  value: AbsenceReason | null;
  onChange: (value: AbsenceReason) => void;
  disabled?: boolean;
  error?: string;
  testID?: string;
}

/** Same wording as the history rows and the read-only detail (UF §33). */
export const ABSENCE_REASON_LABELS: Record<AbsenceReason, string> = {
  Sick: 'مريض',
  Studying: 'دراسة',
  Other: 'سبب آخر',
};

/** Figma SCR-10 · Absent: the "Other" option's inline warning (BR-25). */
export const OTHER_REASON_NOTE = 'سيُحتسب هذا كيوم فائت';

const EXCUSED: AbsenceReason[] = ['Sick', 'Studying'];

/**
 * Figma SCR-10 · Absent (26:546): two groups under overline labels — "غياب
 * بعذر" holding Sick / Studying (BR-24) and "غير ذلك" holding Other with the
 * missed-day note (BR-25). Single-select radio cards, no free-text field.
 */
export function AbsenceReasonPicker({
  value,
  onChange,
  disabled = false,
  error,
  testID = 'absence-reason-picker',
}: AbsenceReasonPickerProps) {
  const option = (reason: AbsenceReason, note?: string) => {
    const label = ABSENCE_REASON_LABELS[reason];
    const selected = value === reason;
    return (
      <Pressable
        key={reason}
        testID={`${testID}-${reason.toLowerCase()}`}
        accessibilityRole="radio"
        accessibilityLabel={`سبب الغياب: ${label}${note ? `. ${note}` : ''}`}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={() => onChange(reason)}
        className={`w-full ${rowStart} items-center gap-3 p-4 rounded-md active:opacity-80 ${
          selected
            ? 'bg-primary-subtle dark:bg-primary-subtle-dark border-[1.5px] border-line-brand dark:border-line-brand-dark'
            : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark'
        } ${disabled ? 'opacity-50' : ''}`}
        style={{ borderCurve: 'continuous' }}
      >
        <View
          className={`w-[22px] h-[22px] rounded-full items-center justify-center ${
            selected
              ? 'bg-primary dark:bg-primary-dark'
              : 'bg-surface dark:bg-surface-dark border-[1.5px] border-line-strong'
          }`}
        >
          {selected ? (
            <View className="w-2 h-2 rounded-full bg-fg-on-primary" />
          ) : null}
        </View>
        <View className={`flex-1 gap-0.5 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.bodyMdMedium} text-right ${
              selected
                ? 'text-brand dark:text-brand-dark'
                : 'text-fg dark:text-fg-dark'
            }`}
          >
            {label}
          </Text>
          {note ? (
            <Text
              className={`w-full ${typography.bodySm} text-right text-fg-warning dark:text-fg-warning-dark`}
            >
              {note}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const groupLabel = (text: string) => (
    <Text
      className={`w-full ${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
    >
      {text}
    </Text>
  );

  return (
    <View
      className={`w-full gap-6 ${itemsStart}`}
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel="سبب الغياب"
    >
      <View className={`w-full gap-2.5 ${itemsStart}`}>
        {groupLabel('غياب بعذر')}
        {EXCUSED.map((reason) => option(reason))}
      </View>
      <View className={`w-full gap-2.5 ${itemsStart}`}>
        {groupLabel('غير ذلك')}
        {option('Other', OTHER_REASON_NOTE)}
      </View>
      {error ? (
        <View
          className={`${rowStart} items-center gap-1 w-full`}
          testID={`${testID}-error`}
          accessibilityRole="alert"
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
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
