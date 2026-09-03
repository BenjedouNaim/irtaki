import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { FullRing, RingArc } from './ring';
import { typography } from '@/shared/theme/typography';
import { useThemeColors } from '@/shared/theme/colors';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** Segment colour; defaults to the Figma palette by position. */
  color?: string;
}

export interface DonutProps {
  /** Legend order — first segment is the first legend row and starts the ring at 12 o'clock. */
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Degrees left empty between segments. */
  gapDegrees?: number;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Figma Donut (19:60) palette: Normal · Revision · Excused · Unexcused · Missed. */
export const DONUT_PALETTE = [
  '#0E6B4A',
  '#2563EB',
  '#CBC5AC',
  '#C08A3E',
  '#C36F4E',
] as const;

export const DONUT_SIZE = 112;
export const DONUT_THICKNESS = 16;

/**
 * Figma Donut (19:60): 112px segmented ring (left) + legend (right) of
 * dot · label · value rows. Day breakdown on Progress, absence reasons on
 * Group Performance. Presentation only — the caller supplies the counts.
 */
export function Donut({
  segments,
  size = DONUT_SIZE,
  thickness = DONUT_THICKNESS,
  gapDegrees = 2,
  testID = 'donut',
  className,
  style,
}: DonutProps) {
  const colors = useThemeColors();
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const visible = segments.filter((s) => s.value > 0);
  const gap = visible.length > 1 ? gapDegrees : 0;
  const available = 360 - gap * visible.length;

  let cursor = 0;
  const arcs = visible.map((s) => {
    const sweep = total > 0 ? (Math.max(0, s.value) / total) * available : 0;
    const arc = { key: s.key, start: cursor, sweep, color: s.color };
    cursor += sweep + gap;
    return arc;
  });

  const summary = segments.map((s) => `${s.label}: ${s.value}`).join('، ');

  return (
    <View
      testID={testID}
      className={`${rowStart} items-center justify-between w-full ${className ?? ''}`}
      style={style}
    >
      <View testID={`${testID}-legend`} className={`gap-2 ${itemsStart}`}>
        {segments.map((s, i) => (
          <View
            key={s.key}
            testID={`${testID}-legend-${s.key}`}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${s.label}: ${s.value}`}
            className={`${rowStart} items-center gap-2`}
          >
            <View
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  s.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length],
              }}
            />
            <Text
              className={`${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
              maxFontSizeMultiplier={1.5}
            >
              {s.label}
            </Text>
            <Text
              testID={`${testID}-legend-${s.key}-value`}
              className={`${typography.labelMd} text-fg dark:text-fg-dark`}
              maxFontSizeMultiplier={1.5}
            >
              {String(s.value)}
            </Text>
          </View>
        ))}
      </View>

      <View
        testID={`${testID}-chart`}
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
        style={{ width: size, height: size }}
      >
        {total === 0 ? (
          <FullRing size={size} thickness={thickness} color={colors.bgSubtle} />
        ) : null}
        {arcs.map((arc, i) => (
          <RingArc
            key={arc.key}
            testID={`${testID}-arc-${arc.key}`}
            size={size}
            thickness={thickness}
            color={
              arc.color ??
              DONUT_PALETTE[
                segments.findIndex((s) => s.key === arc.key) %
                  DONUT_PALETTE.length
              ] ??
              DONUT_PALETTE[i % DONUT_PALETTE.length]
            }
            startAngle={arc.start}
            sweepAngle={arc.sweep}
          />
        ))}
      </View>
    </View>
  );
}
