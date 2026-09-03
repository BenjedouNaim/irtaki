import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { typography } from '@/shared/theme/typography';
import { rowStart, selfStart } from '@/shared/theme/rtl';

export const AT_RISK_LABEL = 'معرّض للخطر';

export interface AtRiskBadgeProps {
  label?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma AtRiskBadge (11:64). At-risk indicator from the /at-risk endpoint —
 * a separate predicate, never inferred from a low score (DMS DS-04).
 * Deliberately distinct from StatusBadge: solid bg/error, alert icon + text.
 */
export function AtRiskBadge({
  label = AT_RISK_LABEL,
  testID = 'at-risk-badge',
  className,
  style,
}: AtRiskBadgeProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={label}
      className={`${rowStart} ${selfStart} items-center h-[26px] rounded-xs bg-error ps-2 pe-2.5 gap-[5px] ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <Icon
        name="alert"
        size={14}
        tone="on-primary"
        testID={`${testID}-icon`}
      />
      <Text
        className={`${typography.labelSm} text-fg-on-primary text-right`}
        numberOfLines={1}
        maxFontSizeMultiplier={1.5}
      >
        {label}
      </Text>
    </View>
  );
}
