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

const DEFAULT_ITEM_HEIGHT = 48;
const DEFAULT_VISIBLE_ITEMS = 5;

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
        // Fallback for environments without haptics
      }
    }
  }, []);

  // Scroll to selected value on mount or when selectedValue changes externally
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
        style={{ height: itemHeight }}
        className={`w-full items-center justify-center ${
          isDisabled ? 'opacity-30' : isSelected ? 'opacity-100' : 'opacity-60'
        }`}
      >
        <Text
          className={`text-center ${
            isSelected
              ? 'text-xl font-bold text-primary dark:text-primary-400'
              : isDisabled
                ? 'text-base font-normal text-gray-400 dark:text-gray-600 line-through'
                : 'text-base font-medium text-gray-700 dark:text-gray-300'
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
      className="w-full relative justify-center items-center overflow-hidden bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-800"
    >
      {/* Central Selection Indicator Bar */}
      <View
        pointerEvents="none"
        style={{
          height: itemHeight,
          top: halfVisible * itemHeight,
        }}
        className="absolute left-3 right-3 rounded-xl bg-primary/10 dark:bg-primary-950/40 border border-primary/30 dark:border-primary-700/50 z-0"
      />

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
        className="w-full z-10"
        initialNumToRender={Math.max(items.length, 20)}
        maxToRenderPerBatch={Math.max(items.length, 20)}
        windowSize={11}
      />
    </View>
  );
}
