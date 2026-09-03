import React from 'react';
import { View, Text, Pressable } from 'react-native';

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

/**
 * Segmented Yes/No control with no default selection (UF §15). Each option
 * carries the question in its accessibility label — never "Yes"/"No" alone
 * (UF §32). 48dp targets; leading option on the right (RTL, UF §31).
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
  const options: Array<{ label: string; selected: boolean; next: boolean }> = [
    { label: 'نعم', selected: value === true, next: true },
    { label: 'لا', selected: value === false, next: false },
  ];

  return (
    <View className="w-full mb-4 gap-2" testID={testID}>
      <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200 text-right">
        {question}
      </Text>
      {note ? (
        <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
          {note}
        </Text>
      ) : null}
      <View
        className="flex-row-reverse rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
        style={{ borderCurve: 'continuous' }}
        accessibilityRole="radiogroup"
      >
        {options.map((option) => (
          <Pressable
            key={option.label}
            testID={`${testID}-${option.next ? 'yes' : 'no'}`}
            accessibilityRole="radio"
            accessibilityLabel={`${question} ${option.label}`}
            accessibilityState={{ selected: option.selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.next)}
            className={`flex-1 min-h-[48px] items-center justify-center ${
              option.selected
                ? 'bg-primary dark:bg-primary-600'
                : 'bg-white dark:bg-gray-900'
            } ${disabled ? 'opacity-50' : ''}`}
          >
            <Text
              className={`text-base font-semibold ${
                option.selected
                  ? 'text-white'
                  : 'text-gray-800 dark:text-gray-200'
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
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
