import React from 'react';
import { View, I18nManager } from 'react-native';

/**
 * View-only ring arcs (no SVG/chart dependency is part of the stack, SA/TS).
 *
 * A "half-window" clips its content to the visual right half of a size×size
 * box; rotating a half-window by φ shows the angular range [φ, φ+180°]
 * (clockwise from 12 o'clock). A full ring seen through one half-window is a
 * half ring; that half ring rotated by ψ covers [ψ, ψ+180°]. Nesting the two
 * and choosing φ = start + sweep − 180, ψ = start yields exactly
 * [start, start+sweep] for sweeps up to 180°; longer sweeps use two arcs.
 *
 * Layout never relies on `left`/`right` (React Native swaps them under RTL):
 * the window is a flex row whose first child is the visual LEFT spacer in
 * both directions, and clipped content is packed to the row end so a
 * size-wide child sits at −size/2.
 */

/** Flex direction whose first child is on the visual left, in LTR and RTL. */
const VISUAL_LTR_ROW = I18nManager.isRTL ? 'row-reverse' : 'row';

function HalfWindow({
  size,
  rotate,
  testID,
  children,
}: {
  size: number;
  rotate: number;
  testID?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        width: size,
        height: size,
        flexDirection: VISUAL_LTR_ROW,
        transform: [{ rotate: `${rotate}deg` }],
      }}
    >
      <View style={{ width: size / 2, height: size }} />
      <View
        style={{
          width: size / 2,
          height: size,
          overflow: 'hidden',
          flexDirection: VISUAL_LTR_ROW,
          justifyContent: 'flex-end',
        }}
      >
        {children}
      </View>
    </View>
  );
}

export interface RingProps {
  size: number;
  thickness: number;
  color: string;
}

/** A complete ring (the track). */
export function FullRing({ size, thickness, color }: RingProps) {
  return (
    <View
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: thickness,
        borderColor: color,
      }}
    />
  );
}

function HalfArc({
  size,
  thickness,
  color,
  start,
  sweep,
  testID,
}: RingProps & { start: number; sweep: number; testID?: string }) {
  return (
    <HalfWindow size={size} rotate={start + sweep - 180} testID={testID}>
      <View
        style={{
          width: size,
          height: size,
          transform: [{ rotate: `${180 - sweep}deg` }],
        }}
      >
        <HalfWindow size={size} rotate={0}>
          <FullRing size={size} thickness={thickness} color={color} />
        </HalfWindow>
      </View>
    </HalfWindow>
  );
}

export interface RingArcProps extends RingProps {
  /** Degrees clockwise from 12 o'clock. */
  startAngle: number;
  /** Degrees, 0–360. */
  sweepAngle: number;
  testID?: string;
}

/** An arc of a ring; renders nothing for a zero sweep, a full ring for 360°. */
export function RingArc({
  size,
  thickness,
  color,
  startAngle,
  sweepAngle,
  testID,
}: RingArcProps) {
  const sweep = Math.max(0, Math.min(360, sweepAngle));
  if (sweep <= 0) return null;
  if (sweep >= 360) {
    return (
      <View
        testID={testID}
        pointerEvents="none"
        style={{ position: 'absolute', top: 0 }}
      >
        <FullRing size={size} thickness={thickness} color={color} />
      </View>
    );
  }
  if (sweep <= 180) {
    return (
      <HalfArc
        size={size}
        thickness={thickness}
        color={color}
        start={startAngle}
        sweep={sweep}
        testID={testID}
      />
    );
  }
  return (
    <>
      <HalfArc
        size={size}
        thickness={thickness}
        color={color}
        start={startAngle}
        sweep={180}
        testID={testID}
      />
      <HalfArc
        size={size}
        thickness={thickness}
        color={color}
        start={startAngle + 180}
        sweep={sweep - 180}
        testID={testID ? `${testID}-tail` : undefined}
      />
    </>
  );
}
