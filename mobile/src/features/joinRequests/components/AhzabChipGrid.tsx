import React, { useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';

export interface AhzabChipGridProps {
  selectedAhzab: number[];
  onChange?: (selected: number[]) => void;
  readOnly?: boolean;
  minRequired?: number;
  testID?: string;
}

const TOTAL_AHZAB = 60;
const ALL_AHZAB = Array.from({ length: TOTAL_AHZAB }, (_, i) => i + 1);

export function AhzabChipGrid({
  selectedAhzab,
  onChange,
  readOnly = false,
  minRequired = 5,
  testID = 'ahzab-chip-grid',
}: AhzabChipGridProps) {
  const selectedSet = new Set(selectedAhzab);
  const count = selectedSet.size;
  const isMinMet = count >= minRequired;

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

  const selectAll = useCallback(() => {
    if (readOnly || !onChange) return;
    onChange([...ALL_AHZAB]);
  }, [onChange, readOnly]);

  const clearAll = useCallback(() => {
    if (readOnly || !onChange) return;
    onChange([]);
  }, [onChange, readOnly]);

  return (
    <View className="w-full gap-3" testID={testID}>
      {/* Header with counter and quick actions */}
      <View className="flex-row items-center justify-between">
        {!readOnly && (
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={selectAll}
              testID="ahzab-select-all"
              className="px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 active:opacity-70"
            >
              <Text className="text-xs text-primary dark:text-primary-400 font-semibold">
                تحديد الكل
              </Text>
            </Pressable>
            <Pressable
              onPress={clearAll}
              testID="ahzab-clear-all"
              className="px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 active:opacity-70"
            >
              <Text className="text-xs text-gray-600 dark:text-gray-400 font-semibold">
                مسح
              </Text>
            </Pressable>
          </View>
        )}

        <View className="flex-row items-center gap-1.5 ml-auto">
          <Text
            className={`text-xs font-bold ${
              isMinMet
                ? 'text-primary dark:text-primary-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
            testID="ahzab-counter"
          >
            {count} / {TOTAL_AHZAB} حزباً
          </Text>
          {!isMinMet && (
            <Text className="text-xs text-amber-600 dark:text-amber-400">
              (الحد الأدنى {minRequired})
            </Text>
          )}
        </View>
      </View>

      {/* 60 Chips Grid */}
      <View className="flex-row flex-wrap gap-1.5 justify-start">
        {ALL_AHZAB.map((hizb) => {
          const isSelected = selectedSet.has(hizb);

          return (
            <Pressable
              key={hizb}
              testID={`ahzab-chip-${hizb}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`حزب ${hizb}`}
              disabled={readOnly}
              onPress={() => toggleHizb(hizb)}
              className={`w-9 h-9 items-center justify-center rounded-lg border ${
                isSelected
                  ? 'bg-primary border-primary dark:bg-primary-600 dark:border-primary-500'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
              } active:opacity-80`}
              style={{ borderCurve: 'continuous' }}
            >
              <Text
                className={`text-xs font-bold ${
                  isSelected
                    ? 'text-white'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {hizb}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
