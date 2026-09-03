import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';

export interface SheetHandleProps {
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Figma SheetHandle (14:102): 24px band with a 40×5 muted grab bar. */
export function SheetHandle({
  testID = 'sheet-handle',
  style,
}: SheetHandleProps) {
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="w-full h-6 items-center justify-center"
      style={style}
    >
      <View className="w-10 h-[5px] rounded-[3px] bg-muted dark:bg-muted-dark" />
    </View>
  );
}
