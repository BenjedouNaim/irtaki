import React, { forwardRef, useState } from 'react';
import { Pressable, TextInput, TextInputProps, View } from 'react-native';
import { getInputClassName, INPUT_HEIGHT } from '@/shared/components/FormField';
import { Icon } from '@/shared/components/Icon';
import { useThemeColors } from '@/shared/theme/colors';

export interface TextInputFieldProps extends Omit<
  TextInputProps,
  'secureTextEntry' | 'editable'
> {
  /** Error state — 1.5px border/error (Figma FormField.Error). */
  error?: boolean;
  /** Disabled state — subtle fill, text/disabled (Figma FormField.Disabled). */
  disabled?: boolean;
  /**
   * Password field: masked, with the Figma TrailingIcon (icon/eye) on the
   * trailing (left) side toggling visibility.
   */
  secure?: boolean;
  /**
   * Latin values (email, timezone id, password dots) are LTR-embedded and sit
   * at the left of the box like the Figma FormField; Arabic values are right-aligned.
   */
  ltr?: boolean;
  testID?: string;
}

/** The 40px eye control + slop reaches the 48dp minimum (UF §32). */
const TOGGLE_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 };

/**
 * The 52px input box of the Figma FormField (6:53) inside a `FormField`
 * wrapper: surface fill, 1px border/default, 1.5px border/brand while focused,
 * 1.5px border/error on error, subtle fill when disabled. Tracks focus itself
 * so screens only pass `error` / `disabled`.
 */
export const TextInputField = forwardRef<TextInput, TextInputFieldProps>(
  function TextInputField(
    {
      error = false,
      disabled = false,
      secure = false,
      ltr = false,
      testID,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const colors = useThemeColors();
    const [focused, setFocused] = useState(false);
    const [masked, setMasked] = useState(true);

    const handleFocus: TextInputProps['onFocus'] = (e) => {
      setFocused(true);
      onFocus?.(e);
    };
    const handleBlur: TextInputProps['onBlur'] = (e) => {
      setFocused(false);
      onBlur?.(e);
    };

    return (
      <View className="w-full">
        <TextInput
          ref={ref}
          testID={testID}
          className={`${getInputClassName({ error, disabled, focused })} ${
            secure ? 'pl-12' : ''
          }`}
          style={{ borderCurve: 'continuous' }}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.bgPrimary}
          editable={!disabled}
          secureTextEntry={secure && masked}
          textAlign={ltr || secure ? 'left' : 'right'}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityState={{ disabled }}
          {...rest}
        />
        {secure ? (
          <Pressable
            testID={testID ? `${testID}-toggle-visibility` : undefined}
            onPress={() => setMasked((m) => !m)}
            disabled={disabled}
            hitSlop={TOGGLE_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={
              masked ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور'
            }
            className="absolute left-2 top-0 w-10 items-center justify-center active:opacity-70"
            style={{ height: INPUT_HEIGHT }}
          >
            <Icon
              name={masked ? 'eye' : 'eye-off'}
              size={20}
              tone={disabled ? 'disabled' : 'secondary'}
            />
          </Pressable>
        ) : null}
      </View>
    );
  },
);
