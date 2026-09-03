import React, { useCallback, useMemo } from 'react';
import { View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Chip } from '@/shared/components/Chip';
import { Icon } from '@/shared/components/Icon';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

export interface AhzabChipGridProps {
  selectedAhzab: number[];
  onChange?: (selected: number[]) => void;
  /** Applicant Detail: filled/empty compact cells, no interaction (UF §19). */
  readOnly?: boolean;
  minRequired?: number;
  /** Interactive mode: field label rendered above the grid with the counter. */
  label?: string;
  required?: boolean;
  /** Inline error (422) — icon + text, never colour alone (UF §32). */
  error?: string;
  testID?: string;
}

const TOTAL_AHZAB = 60;
const ALL_AHZAB = Array.from({ length: TOTAL_AHZAB }, (_, i) => i + 1);

/** Figma AhzabGrid (23:363): 6 chips per row; Applicant Detail grid (35:261): 10 per row. */
const INTERACTIVE_PER_ROW = 6;
const READ_ONLY_PER_ROW = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

/**
 * Ahzab multi-select (UF §19): 60 numbered toggle chips, RTL-ordered (hizb
 * 1 rightmost), with a live "X selected · minimum 5" counter. Reused
 * read-only on the Assistant's Applicant Detail (compact filled/empty cells).
 */
export function AhzabChipGrid({
  selectedAhzab,
  onChange,
  readOnly = false,
  minRequired = 5,
  label,
  required = false,
  error,
  testID = 'ahzab-chip-grid',
}: AhzabChipGridProps) {
  const selectedSet = useMemo(() => new Set(selectedAhzab), [selectedAhzab]);
  const count = selectedSet.size;
  const isMinMet = count >= minRequired;
  const hasError = Boolean(error);

  const toggleHizb = useCallback(
    (hizbNumber: number) => {
      if (readOnly || !onChange) return;

      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          Haptics.selectionAsync();
        } catch {
          // Ignored
        }
      }

      const next = new Set(selectedSet);
      if (next.has(hizbNumber)) {
        next.delete(hizbNumber);
      } else {
        next.add(hizbNumber);
      }

      onChange(Array.from(next).sort((a, b) => a - b));
    },
    [onChange, readOnly, selectedSet],
  );

  const rows = chunk(
    ALL_AHZAB,
    readOnly ? READ_ONLY_PER_ROW : INTERACTIVE_PER_ROW,
  );

  return (
    <View
      className={`w-full ${readOnly ? 'gap-1.5' : 'gap-2'} ${itemsStart}`}
      testID={testID}
    >
      {!readOnly ? (
        <View
          className={`${rowStart} items-center justify-between w-full mb-2`}
        >
          {label ? (
            <View className={`${rowStart} items-center gap-1`}>
              <Text
                className={`${typography.labelMd} text-right text-fg dark:text-fg-dark`}
              >
                {label}
              </Text>
              {required ? (
                <Text
                  className={`${typography.labelMd} ${
                    hasError
                      ? 'text-fg-error'
                      : 'text-fg-tertiary dark:text-fg-tertiary-dark'
                  }`}
                  accessibilityLabel="مطلوب"
                >
                  *
                </Text>
              ) : null}
            </View>
          ) : (
            <View />
          )}
          <Text
            className={`${typography.labelSm} text-left ${
              isMinMet
                ? 'text-fg-success'
                : 'text-fg-secondary dark:text-fg-secondary-dark'
            }`}
            testID="ahzab-counter"
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={1.5}
          >
            {`${count} محددة · الحد الأدنى ${minRequired}`}
          </Text>
        </View>
      ) : null}

      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          className={`${rowStart} items-start w-full ${
            readOnly ? 'gap-1' : 'justify-between'
          }`}
        >
          {row.map((hizb) => (
            <Chip
              key={hizb}
              label={String(hizb)}
              type="ahzab"
              selected={selectedSet.has(hizb)}
              readOnly={readOnly}
              compact={readOnly}
              accessibilityLabel={`حزب ${hizb}`}
              onPress={() => toggleHizb(hizb)}
              testID={`ahzab-chip-${hizb}`}
            />
          ))}
        </View>
      ))}

      {hasError ? (
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
