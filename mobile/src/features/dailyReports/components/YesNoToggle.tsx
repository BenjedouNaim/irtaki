import React from 'react';
import { View, Text } from 'react-native';
import { Icon } from '@/shared/components/Icon';
import { SegmentedControl } from '@/shared/components/SegmentedControl';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';

export interface YesNoToggleProps {
  /** The question is the label (UF §20 "Yes/No gate question"). */
  question: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Small neutral note under the question (e.g. ISS-12 "feeds no metric"). */
  note?: string;
  error?: string;
  testID?: string;
}

type YesNo = 'yes' | 'no';

const OPTIONS: Array<{ label: string; value: YesNo }> = [
  { label: 'نعم', value: 'yes' },
  { label: 'لا', value: 'no' },
];

/**
 * Figma gate question: label/lg question over a 2-segment SegmentedControl
 * (7:28) with no default selection (UF §15). Each option carries the
 * question in its accessibility label — never "Yes"/"No" alone (UF §32).
 * Leading option ("نعم") on the right (UF §31).
 */
export function YesNoToggle({
  question,
  value,
  onChange,
  disabled = false,
  note,
  error,
  testID = 'yes-no-toggle',
}: YesNoToggleProps) {
  const selected: YesNo | null = value === null ? null : value ? 'yes' : 'no';

  return (
    <View className={`w-full gap-2 ${itemsStart}`}>
      <Text
        className={`w-full ${typography.labelLg} text-right ${
          disabled ? 'text-fg-disabled' : 'text-fg dark:text-fg-dark'
        }`}
      >
        {question}
      </Text>
      {note ? (
        <Text
          className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        >
          {note}
        </Text>
      ) : null}
      <SegmentedControl<YesNo>
        options={OPTIONS}
        value={selected}
        onChange={(next) => onChange(next === 'yes')}
        disabled={disabled}
        accessibilityLabel={question}
        testID={testID}
      />
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
