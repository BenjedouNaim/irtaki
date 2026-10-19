import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useThemeColors } from '@/shared/theme/colors';

/** Keep the web app at phone dimensions without restricting small screens. */
export function AppViewport({ children }: React.PropsWithChildren) {
  const { width } = useWindowDimensions();
  const colors = useThemeColors();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: width >= 600 ? 24 : 0,
        backgroundColor: colors.bgSubtle,
      }}
    >
      <View
        testID="app-viewport"
        style={{
          width: '100%',
          height: '100%',
          maxWidth: 430,
          maxHeight: 932,
          minHeight: 0,
          flexShrink: 1,
          overflow: 'hidden',
          backgroundColor: colors.bgCanvas,
        }}
      >
        {children}
      </View>
    </View>
  );
}
