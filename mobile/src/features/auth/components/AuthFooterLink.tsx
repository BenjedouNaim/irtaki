import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';

export interface AuthFooterLinkProps {
  /** The question, rightmost ("ليس لديك حساب؟"). */
  prompt: string;
  /** The brand-coloured link after it ("إنشاء حساب"). */
  linkLabel: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

/** The 22px link row + slop reaches the 48dp minimum (UF §32). */
const LINK_HIT_SLOP = { top: 13, bottom: 13, left: 8, right: 8 };

/**
 * The centred Footer of the Figma auth screens (20:52 / 20:198): body/md
 * secondary prompt followed by a label/md brand link, 6px apart.
 */
export function AuthFooterLink({
  prompt,
  linkLabel,
  onPress,
  disabled = false,
  testID,
}: AuthFooterLinkProps) {
  return (
    <View
      className={`${rowStart} w-full justify-center items-baseline gap-1.5`}
    >
      <Text
        className={`${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {prompt}
      </Text>
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        hitSlop={LINK_HIT_SLOP}
        accessibilityRole="link"
        accessibilityLabel={linkLabel}
        accessibilityState={{ disabled }}
        className="active:opacity-70"
      >
        <Text
          className={`${typography.labelMd} text-right text-brand dark:text-brand-dark`}
        >
          {linkLabel}
        </Text>
      </Pressable>
    </View>
  );
}
