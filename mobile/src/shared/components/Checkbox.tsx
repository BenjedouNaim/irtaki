import React from 'react';
import { Pressable, View, Text, StyleProp, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Rendered to the left of the box (the box leads from the right, RTL). */
  label?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma Checkbox (9:28): 24px box, radius xs; checked = bg/primary with a
 * 16px check; unchecked = surface with a 1.5px border/strong. Fee-agreement
 * checkbox — leads from the right in RTL.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  accessibilityLabel,
  testID = 'checkbox',
  className,
  style,
}: CheckboxProps) {
  return (
    <Pressable
      testID={testID}
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked, disabled }}
      className={`${rowStart} items-center gap-3 min-h-[48px] ${
        disabled ? 'opacity-50' : ''
      } ${className ?? ''}`}
      style={style}
    >
      <View
        testID={`${testID}-box`}
        className={`w-6 h-6 rounded-xs items-center justify-center ${
          checked
            ? 'bg-primary dark:bg-primary-dark'
            : 'bg-surface dark:bg-surface-dark border-[1.5px] border-line-strong'
        }`}
        style={{ borderCurve: 'continuous' }}
      >
        {checked ? (
          <Icon
            name="check"
            size={16}
            tone="on-primary"
            testID={`${testID}-check`}
          />
        ) : null}
      </View>
      {label ? (
        <Text
          className={`flex-1 ${typography.bodyMd} text-right text-fg dark:text-fg-dark`}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
