import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SurahDto } from '../../../shared/api/quran.client';

export interface SurahSearchListProps {
  surahs: SurahDto[];
  selectedSurahNumber?: number;
  onSelectSurah: (surah: SurahDto) => void;
  testID?: string;
}

export function SurahSearchList({
  surahs,
  selectedSurahNumber,
  onSelectSurah,
  testID = 'surah-search-list',
}: SurahSearchListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSurahs = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      // Must maintain mushaf order (ascending by number, never alphabetical)
      return [...surahs].sort((a, b) => a.number - b.number);
    }

    const queryLower = trimmed.toLowerCase();
    return surahs.filter((surah) => {
      const nameMatches = surah.name_ar.includes(trimmed);
      const numberMatches =
        String(surah.number).startsWith(trimmed) ||
        String(surah.number) === trimmed;
      return nameMatches || numberMatches;
    });
  }, [surahs, searchQuery]);

  const handleSelect = useCallback(
    (surah: SurahDto) => {
      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          Haptics.selectionAsync();
        } catch {
          // Ignored
        }
      }
      onSelectSurah(surah);
    },
    [onSelectSurah],
  );

  const renderSurahRow = ({ item }: { item: SurahDto }) => {
    const isSelected = item.number === selectedSurahNumber;

    return (
      <Pressable
        key={item.number}
        testID={`surah-row-${item.number}`}
        onPress={() => handleSelect(item)}
        accessibilityRole="button"
        accessibilityLabel={`سورة ${item.name_ar}، رقم ${item.number}، ${item.ayah_count} آية`}
        accessibilityState={{ selected: isSelected }}
        className={`flex-row-reverse items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 active:bg-gray-100 dark:active:bg-gray-800/60 ${
          isSelected
            ? 'bg-primary/10 dark:bg-primary-950/40'
            : 'bg-transparent'
        }`}
      >
        <View className="flex-row-reverse items-center gap-3">
          {/* Surah Number Badge */}
          <View
            className={`w-9 h-9 rounded-full items-center justify-center ${
              isSelected
                ? 'bg-primary dark:bg-primary-600'
                : 'bg-gray-100 dark:bg-gray-800'
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                isSelected
                  ? 'text-white'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {item.number}
            </Text>
          </View>

          {/* Surah Name */}
          <Text
            className={`text-base text-right ${
              isSelected
                ? 'font-bold text-primary dark:text-primary-400'
                : 'font-medium text-gray-900 dark:text-gray-100'
            }`}
          >
            سورة {item.name_ar}
          </Text>
        </View>

        {/* Ayah Count Info */}
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {item.ayah_count} آية
        </Text>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 w-full" testID={testID}>
      {/* Search Input Bar */}
      <View className="px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <View className="flex-row-reverse items-center bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2">
          <TextInput
            testID={`${testID}-search-input`}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="بحث عن سورة بالاسم أو الرقم..."
            placeholderTextColor="#9ca3af"
            className="flex-1 text-right text-gray-900 dark:text-gray-100 text-sm py-1 font-normal"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              testID={`${testID}-clear-search`}
              accessibilityRole="button"
              accessibilityLabel="مسح البحث"
              className="p-1"
            >
              <Text className="text-xs text-gray-400 dark:text-gray-500 font-bold">
                ✕
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Surah List / No Results */}
      {filteredSurahs.length === 0 ? (
        <View
          testID={`${testID}-no-results`}
          className="flex-1 items-center justify-center p-8 gap-2"
        >
          <Text className="text-base font-semibold text-gray-700 dark:text-gray-300 text-center">
            لا توجد نتائج للبحث
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400 text-center">
            لم يتم العثور على أي سورة تطابق "{searchQuery}"
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSurahs}
          keyExtractor={(item) => String(item.number)}
          renderItem={renderSurahRow}
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          initialNumToRender={20}
          maxToRenderPerBatch={30}
        />
      )}
    </View>
  );
}
