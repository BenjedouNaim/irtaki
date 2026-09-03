import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, FlatList, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon } from '../../../shared/components/Icon';
import { SurahDto } from '../../../shared/api/quran.client';
import { typography } from '../../../shared/theme/typography';
import { useThemeColors } from '../../../shared/theme/colors';
import { rowStart } from '../../../shared/theme/rtl';

export interface SurahSearchListProps {
  surahs: SurahDto[];
  selectedSurahNumber?: number;
  onSelectSurah: (surah: SurahDto) => void;
  testID?: string;
}

/**
 * Figma SCR-11 surah step (27:490): a subtle search field ("ابحث عن سورة",
 * search glyph on the right) over the list in mushaf order — each row a
 * 32px number tile + the name (right) and "{n} آية" (left), the selected
 * row in text/brand with a check. Searches by Arabic name substring or
 * number prefix.
 */
export function SurahSearchList({
  surahs,
  selectedSurahNumber,
  onSelectSurah,
  testID = 'surah-search-list',
}: SurahSearchListProps) {
  const colors = useThemeColors();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSurahs = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      // Must maintain mushaf order (ascending by number, never alphabetical)
      return [...surahs].sort((a, b) => a.number - b.number);
    }

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

  const renderSurahRow = ({
    item,
    index,
  }: {
    item: SurahDto;
    index: number;
  }) => {
    const isSelected = item.number === selectedSurahNumber;
    const last = index === filteredSurahs.length - 1;

    return (
      <Pressable
        key={item.number}
        testID={`surah-row-${item.number}`}
        onPress={() => handleSelect(item)}
        accessibilityRole="button"
        accessibilityLabel={`سورة ${item.name_ar}، رقم ${item.number}، ${item.ayah_count} آية`}
        accessibilityState={{ selected: isSelected }}
        className={`${rowStart} items-center justify-between py-3.5 gap-3 active:opacity-80 ${
          last ? '' : 'border-b border-line dark:border-line-dark'
        }`}
      >
        <View className={`${rowStart} items-center gap-3 flex-1`}>
          <View
            className={`w-8 h-8 rounded-sm items-center justify-center ${
              isSelected
                ? 'bg-primary-subtle dark:bg-primary-subtle-dark'
                : 'bg-subtle dark:bg-subtle-dark'
            }`}
            style={{ borderCurve: 'continuous' }}
          >
            <Text
              className={`${typography.labelSm} text-center ${
                isSelected
                  ? 'text-brand dark:text-brand-dark'
                  : 'text-fg-secondary dark:text-fg-secondary-dark'
              }`}
              maxFontSizeMultiplier={1.4}
            >
              {item.number}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            className={`flex-1 text-right ${
              isSelected
                ? `${typography.headingSm} text-brand dark:text-brand-dark`
                : `${typography.bodyLg} text-fg dark:text-fg-dark`
            }`}
          >
            {item.name_ar}
          </Text>
        </View>

        <View className={`${rowStart} items-center gap-2`}>
          {isSelected ? <Icon name="check" size={18} tone="success" /> : null}
          <Text
            className={`${typography.bodySm} text-fg-tertiary dark:text-fg-tertiary-dark`}
          >
            {item.ayah_count} آية
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 w-full gap-3" testID={testID}>
      <View
        className={`${rowStart} items-center gap-2.5 px-3.5 py-3 rounded-md bg-subtle dark:bg-subtle-dark`}
        style={{ borderCurve: 'continuous' }}
      >
        <Icon name="search" size={18} tone="tertiary" />
        <TextInput
          testID={`${testID}-search-input`}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="ابحث عن سورة"
          placeholderTextColor={colors.textTertiary}
          className={`flex-1 p-0 ${typography.bodyMd} text-right text-fg dark:text-fg-dark`}
          textAlign="right"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="ابحث عن سورة"
        />
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={() => setSearchQuery('')}
            testID={`${testID}-clear-search`}
            accessibilityRole="button"
            accessibilityLabel="مسح البحث"
            hitSlop={12}
            className="w-6 h-6 items-center justify-center"
          >
            <Icon name="x" size={16} tone="secondary" />
          </Pressable>
        ) : null}
      </View>

      {filteredSurahs.length === 0 ? (
        <View
          testID={`${testID}-no-results`}
          className="flex-1 items-center justify-center p-8 gap-1"
        >
          <Text
            className={`${typography.bodyMdMedium} text-center text-fg dark:text-fg-dark`}
          >
            لا توجد نتائج للبحث
          </Text>
          <Text
            className={`${typography.bodySm} text-center text-fg-secondary dark:text-fg-secondary-dark`}
          >
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
