import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { typography } from '@/shared/theme/typography';

export interface WheelPickerItem {
  label: string;
  value: number | string;
  disabled?: boolean;
}

export interface WheelPickerProps {
  items: WheelPickerItem[];
  selectedValue?: number | string;
  onValueChange?: (value: number | string, index: number) => void;
  itemHeight?: number;
  visibleItems?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Figma WheelPicker (19:88): 40px items, 3 above + selected + 3 below. */
const DEFAULT_ITEM_HEIGHT = 40;
const DEFAULT_VISIBLE_ITEMS = 7;

/** Figma fades items by distance from the selection: 0.9 · 0.55 · 0.3. */
function opacityForDistance(distance: number): number {
  if (distance <= 0) return 1;
  if (distance === 1) return 0.9;
  if (distance === 2) return 0.55;
  return 0.3;
}

/**
 * Vertical wheel — direction-agnostic (UF §31). Ayah selection
 * (1..ayah_count) and memorization/revision time. Selected item = subtle
 * pill with heading/md text; others body/lg tertiary fading with distance;
 * options before the FROM ordinal render disabled at opacity 0.3.
 */
export function WheelPicker({
  items,
  selectedValue,
  onValueChange,
  itemHeight = DEFAULT_ITEM_HEIGHT,
  visibleItems = DEFAULT_VISIBLE_ITEMS,
  testID = 'wheel-picker',
  style,
}: WheelPickerProps) {
  const flatListRef = useRef<FlatList<WheelPickerItem>>(null);
  const halfVisible = Math.floor(visibleItems / 2);
  const containerHeight = itemHeight * visibleItems;

  const selectedIndex = items.findIndex((item) => item.value === selectedValue);

  const triggerHaptic = useCallback(() => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.selectionAsync();
      } catch {
        // Haptics are best-effort.
      }
    }
  }, []);

  useEffect(() => {
    if (selectedIndex >= 0 && flatListRef.current) {
      flatListRef.current.scrollToOffset({
        offset: selectedIndex * itemHeight,
        animated: false,
      });
    }
  }, [selectedIndex, itemHeight]);

  const handleItemPress = (item: WheelPickerItem, index: number) => {
    if (item.disabled) return;
    triggerHaptic();
    flatListRef.current?.scrollToOffset({
      offset: index * itemHeight,
      animated: true,
    });
    if (onValueChange && item.value !== selectedValue) {
      onValueChange(item.value, index);
    }
  };

  const handleMomentumScrollEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / itemHeight);
    const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
    const item = items[clampedIndex];

    if (item && !item.disabled && item.value !== selectedValue) {
      triggerHaptic();
      onValueChange?.(item.value, clampedIndex);
    }
  };

  const renderItem = ({
    item,
    index,
  }: {
    item: WheelPickerItem;
    index: number;
  }) => {
    const isSelected = item.value === selectedValue;
    const isDisabled = Boolean(item.disabled);
    const distance = selectedIndex >= 0 ? Math.abs(index - selectedIndex) : 3;

    return (
      <Pressable
        key={`${item.value}-${index}`}
        testID={`${testID}-item-${item.value}`}
        disabled={isDisabled}
        onPress={() => handleItemPress(item, index)}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{
          disabled: isDisabled,
          selected: isSelected,
        }}
        style={{
          height: itemHeight,
          opacity: isDisabled ? 0.3 : opacityForDistance(distance),
        }}
        className={`w-full items-center justify-center rounded-sm ${
          isSelected ? 'bg-subtle dark:bg-subtle-dark' : ''
        }`}
      >
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          className={`text-center ${
            isSelected
              ? `${typography.headingMd} text-fg dark:text-fg-dark`
              : `${typography.bodyLg} text-fg-tertiary dark:text-fg-tertiary-dark ${
                  isDisabled ? 'line-through' : ''
                }`
          }`}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      testID={testID}
      style={[{ height: containerHeight }, style]}
      className="w-full overflow-hidden"
    >
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item) => String(item.value)}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: itemHeight,
          offset: itemHeight * index,
          index,
        })}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentContainerStyle={{
          paddingVertical: halfVisible * itemHeight,
        }}
        className="w-full"
        initialNumToRender={Math.max(items.length, 20)}
        maxToRenderPerBatch={Math.max(items.length, 20)}
        windowSize={11}
      />
    </View>
  );
}
