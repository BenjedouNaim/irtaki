import React from 'react';
import { Pressable, View, StyleProp, ViewStyle } from 'react-native';

export interface ToggleProps {
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const KNOB = 26;
/** Knob travel from the track centre: (52 − 26) / 2 − 3px inset. */
const KNOB_OFFSET = (TRACK_WIDTH - KNOB) / 2 - 3;

/**
 * Figma Toggle (9:33): 52×32 track, 26px knob. On = bg/primary with the knob
 * on the LEFT (RTL); Off = bg/muted with the knob on the right. Mute toggle
 * (Notification Preferences) and Enrollment Open/Closed (Teacher).
 */
export function Toggle({
  on,
  onChange,
  disabled = false,
  accessibilityLabel,
  testID = 'toggle',
  style,
}: ToggleProps) {
  return (
    <Pressable
      testID={testID}
      onPress={() => onChange(!on)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled }}
      className={`min-h-[48px] justify-center ${disabled ? 'opacity-50' : ''}`}
      style={style}
    >
      <View
        testID={`${testID}-track`}
        className={`items-center justify-center rounded-full ${
          on ? 'bg-primary dark:bg-primary-dark' : 'bg-muted dark:bg-muted-dark'
        }`}
        style={{ width: TRACK_WIDTH, height: TRACK_HEIGHT }}
      >
        <View
          testID={`${testID}-knob`}
          className="rounded-full bg-surface"
          // translateX is never mirrored by RTL, so "on = left" holds everywhere.
          style={{
            width: KNOB,
            height: KNOB,
            transform: [{ translateX: on ? -KNOB_OFFSET : KNOB_OFFSET }],
          }}
        />
      </View>
    </Pressable>
  );
}
