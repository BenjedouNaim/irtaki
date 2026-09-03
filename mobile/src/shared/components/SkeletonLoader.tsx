import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { SkeletonBlock, SkeletonRow } from './SkeletonRow';
import { rowStart, itemsStart } from '@/shared/theme/rtl';

/**
 * Layout-matched skeletons (UF §22) in the token palette:
 * - `row`: the Figma SkeletonRow (list rows).
 * - `dashboard`: title + two stat tiles + one wide block.
 * - `ring`: a metric card built around a circular gauge (title, 120dp circle,
 *   a text line and a notice block) — mirrors the Progress section's layout.
 * - `card`: a status/CTA card (badge, title, one text line, one 52dp button)
 *   — mirrors the Daily Report CTA card on Student Home.
 * - `reportRow`: a history row (date line + summary line on the reading
 *   side, a type pill on the far side) — mirrors SCR-14's list rows.
 * - `metricRow`: a label/value row (label on the reading side, a short bold
 *   value on the far side) — mirrors the Metric row (UF §29) stack of SCR-12.
 * - `performanceScore`: the SCR-13 commitment-score card — label, display
 *   number, caption (UF §22).
 * - `performanceDetail`: the rest of the SCR-13 Performance stack below the
 *   memorization card — a donut card, a two-up tile row and one short row.
 */
export type SkeletonVariant =
  | 'row'
  | 'dashboard'
  | 'ring'
  | 'card'
  | 'reportRow'
  | 'metricRow'
  | 'performanceScore'
  | 'performanceDetail';

export interface SkeletonLoaderProps {
  variant?: SkeletonVariant;
  count?: number;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

const CARD =
  'rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark';

export function SkeletonLoader({
  variant = 'row',
  count = 1,
  testID = 'skeleton-loader',
  className,
  style,
}: SkeletonLoaderProps) {
  if (variant === 'dashboard') {
    return (
      <View
        testID={testID}
        accessibilityLabel="جارٍ التحميل"
        className={`w-full p-4 gap-4 ${itemsStart} ${className ?? ''}`}
        style={style}
      >
        <SkeletonBlock className="w-1/2 h-6 rounded-md" />
        <View className={`${rowStart} gap-3 w-full`}>
          <SkeletonBlock tone="subtle" className={`flex-1 h-[90px] ${CARD}`} />
          <SkeletonBlock tone="subtle" className={`flex-1 h-[90px] ${CARD}`} />
        </View>
        <SkeletonBlock tone="subtle" className={`w-full h-40 ${CARD}`} />
      </View>
    );
  }

  if (variant === 'ring') {
    return (
      <View
        testID={testID}
        accessibilityLabel="جارٍ التحميل"
        className={`w-full p-5 gap-5 items-center ${className ?? ''}`}
        style={style}
      >
        <SkeletonBlock
          testID="skeleton-ring-title"
          className="w-1/2 h-6 rounded-md"
        />
        <SkeletonBlock
          testID="skeleton-ring-circle"
          tone="subtle"
          className="w-[120px] h-[120px] rounded-full"
        />
        <View className="w-full gap-2 items-center">
          <SkeletonBlock
            testID="skeleton-ring-line-0"
            className="w-4/5 h-4 rounded-sm"
          />
          <SkeletonBlock
            testID="skeleton-ring-line-1"
            tone="subtle"
            className="w-full h-10 rounded-md"
          />
        </View>
      </View>
    );
  }

  if (variant === 'performanceScore') {
    return (
      <View
        testID={testID}
        accessibilityLabel="جارٍ التحميل"
        className={`w-full p-5 gap-2 ${itemsStart} ${CARD} ${className ?? ''}`}
        style={[{ borderCurve: 'continuous' }, style]}
      >
        <SkeletonBlock
          testID="skeleton-performance-score-label"
          className="w-1/3 h-3 rounded-sm"
        />
        <SkeletonBlock
          testID="skeleton-performance-score-value"
          tone="subtle"
          className="w-2/5 h-[52px] rounded-md"
        />
        <SkeletonBlock
          testID="skeleton-performance-score-caption"
          className="w-3/5 h-3 rounded-sm"
        />
      </View>
    );
  }

  if (variant === 'performanceDetail') {
    return (
      <View
        testID={testID}
        accessibilityLabel="جارٍ التحميل"
        className={`w-full gap-4 ${className ?? ''}`}
        style={style}
      >
        {/* Breakdown card: title, donut circle and its legend rows. */}
        <View className={`w-full p-5 gap-4 ${itemsStart} ${CARD}`}>
          <SkeletonBlock
            testID="skeleton-performance-breakdown-title"
            className="w-2/5 h-5 rounded-md"
          />
          <View className={`${rowStart} items-center justify-between w-full`}>
            <View className={`flex-1 gap-2 ${itemsStart}`}>
              {[0, 1, 2, 3, 4].map((row) => (
                <SkeletonBlock
                  key={row}
                  testID={`skeleton-performance-legend-${row}`}
                  tone="subtle"
                  className="w-3/5 h-3 rounded-sm"
                />
              ))}
            </View>
            <SkeletonBlock
              testID="skeleton-performance-donut"
              tone="subtle"
              className="w-[112px] h-[112px] rounded-full"
            />
          </View>
        </View>

        {/* Two-up tile row. */}
        <View className={`${rowStart} gap-3 w-full`}>
          <SkeletonBlock
            testID="skeleton-performance-tile-0"
            tone="subtle"
            className={`flex-1 h-[96px] ${CARD}`}
          />
          <SkeletonBlock
            testID="skeleton-performance-tile-1"
            tone="subtle"
            className={`flex-1 h-[96px] ${CARD}`}
          />
        </View>

        {/* Days-since row. */}
        <SkeletonBlock
          testID="skeleton-performance-days-since"
          tone="subtle"
          className={`w-full h-[66px] ${CARD}`}
        />
      </View>
    );
  }

  if (variant === 'card') {
    return (
      <View
        testID={testID}
        accessibilityLabel="جارٍ التحميل"
        className={`w-full p-5 gap-3 ${itemsStart} ${className ?? ''}`}
        style={style}
      >
        <SkeletonBlock
          testID="skeleton-card-badge"
          tone="subtle"
          className="w-24 h-7 rounded-full"
        />
        <SkeletonBlock
          testID="skeleton-card-title"
          className="w-3/5 h-6 rounded-md"
        />
        <SkeletonBlock
          testID="skeleton-card-line"
          tone="subtle"
          className="w-full h-4 rounded-sm"
        />
        <SkeletonBlock
          testID="skeleton-card-button"
          className="w-full h-[52px] rounded-md"
        />
      </View>
    );
  }

  const items = Array.from({ length: count }, (_, i) => i);

  if (variant === 'metricRow') {
    return (
      <View
        testID={testID}
        accessibilityLabel="جارٍ التحميل"
        className={`w-full gap-3 ${className ?? ''}`}
        style={style}
      >
        {items.map((key) => (
          <View
            key={key}
            testID={`skeleton-metric-row-${key}`}
            className={`${rowStart} items-center justify-between min-h-[44px] gap-3 w-full`}
          >
            <SkeletonBlock tone="subtle" className="w-3/5 h-4 rounded-sm" />
            <SkeletonBlock className="w-10 h-7 rounded-sm" />
          </View>
        ))}
      </View>
    );
  }

  if (variant === 'reportRow') {
    return (
      <View
        testID={testID}
        accessibilityLabel="جارٍ التحميل"
        className={`w-full gap-3 ${className ?? ''}`}
        style={style}
      >
        {items.map((key) => (
          <View
            key={key}
            testID={`skeleton-report-row-${key}`}
            className={`${rowStart} items-center justify-between min-h-[64px] px-4 py-3 gap-3 w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark`}
            style={{ borderCurve: 'continuous' }}
          >
            <View className={`flex-1 gap-2 ${itemsStart}`}>
              <SkeletonBlock className="w-2/5 h-3 rounded-[6px]" />
              <SkeletonBlock
                tone="subtle"
                className="w-3/5 h-2.5 rounded-[5px]"
              />
            </View>
            <SkeletonBlock tone="subtle" className="w-16 h-7 rounded-full" />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityLabel="جارٍ التحميل"
      className={`w-full gap-3 ${className ?? ''}`}
      style={style}
    >
      {items.map((key) => (
        <SkeletonRow key={key} testID={`skeleton-row-${key}`} />
      ))}
    </View>
  );
}
