import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';

/** Figma StepIndicator steps — Gender → Eligible groups → Profile. */
export const JOIN_STEPS = ['الجنس', 'المجموعات', 'الملف الشخصي'] as const;

export interface StepIndicatorProps {
  /** 1-based current step. */
  step: number;
  steps?: readonly string[];
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Figma StepIndicator (17:137): one 4px bar + label/sm per step, 8px gaps,
 * step 1 rightmost (UF §31). Done and current bars are bg/primary; done
 * labels text/brand, current text/primary, upcoming text/tertiary.
 */
export function StepIndicator({
  step,
  steps = JOIN_STEPS,
  testID = 'step-indicator',
  className,
  style,
}: StepIndicatorProps) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`الخطوة ${step} من ${steps.length}: ${steps[step - 1] ?? ''}`}
      accessibilityValue={{ min: 1, max: steps.length, now: step }}
      className={`${rowStart} items-start gap-2 w-full ${className ?? ''}`}
      style={style}
    >
      {steps.map((label, i) => {
        const index = i + 1;
        const done = index < step;
        const current = index === step;
        return (
          <View key={label} className="flex-1 items-center gap-2">
            <View
              testID={`${testID}-bar-${index}-${done || current ? 'active' : 'inactive'}`}
              className={`w-full h-1 rounded-[2px] ${
                done || current
                  ? 'bg-primary dark:bg-primary-dark'
                  : 'bg-muted dark:bg-muted-dark'
              }`}
            />
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              className={`${typography.labelSm} text-center ${
                done
                  ? 'text-brand dark:text-brand-dark'
                  : current
                    ? 'text-fg dark:text-fg-dark'
                    : 'text-fg-tertiary dark:text-fg-tertiary-dark'
              }`}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
