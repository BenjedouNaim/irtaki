import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { Icon } from '@/shared/components/Icon';
import { METRIC_NULL_PLACEHOLDER } from '@/shared/components/MetricRow';
import { METRIC_TILE_NULL_VALUE } from '@/shared/components/MetricTile';
import type { TeacherGroupDto } from '@/shared/api/dashboard.client';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { formatRate } from '../utils/dashboardCopy';

export interface TeacherGroupCardProps {
  group: TeacherGroupDto;
  /** The group's own line under its name, e.g. the recitation day. */
  meta?: string;
  onPress?: () => void;
  testID?: string;
}

const AVERAGE_LABEL = 'متوسط الالتزام';
const AT_RISK_LABEL = 'معرّضون للخطر';
const SUBMISSION_LABEL = 'نسبة الإرسال';

/**
 * SCR-22's GroupCard (Figma 37:37): the group's header row and the three
 * figures API-009's Teacher payload carries for it — `commitment_average`,
 * `at_risk_count` and `submission_rate` (UF §10 "Card per group").
 *
 * Order follows the frame, read right-to-left: average · at-risk ·
 * submission rate — the same order SCR-23's tile row leads with.
 *
 * A null rate renders MetricTile's em-dash in the tertiary tone, never `0%`
 * (DEC-B04 / API-X07): a group whose week has produced no expected day yet
 * has no rate, and printing zero would read as total failure. The cell keeps
 * its label — in a three-cell row the label is what names the figure — and
 * "بيانات غير كافية" travels on the card's accessibility label instead of
 * replacing it. `at_risk_count`
 * is a genuine count, so its zero is printed as zero — and only a non-zero
 * one is tinted, since a red `0` would read as an alarm (UF §32: never
 * colour alone; the label carries the meaning either way).
 */
export function TeacherGroupCard({
  group,
  meta,
  onPress,
  testID = 'teacher-group-card',
}: TeacherGroupCardProps) {
  const average = formatRate(group.commitment_average);
  const submission = formatRate(group.submission_rate);
  const accessibilityLabel = [
    group.name,
    meta,
    `${AVERAGE_LABEL}: ${average ?? METRIC_NULL_PLACEHOLDER}`,
    `${AT_RISK_LABEL}: ${group.at_risk_count}`,
    `${SUBMISSION_LABEL}: ${submission ?? METRIC_NULL_PLACEHOLDER}`,
  ]
    .filter(Boolean)
    .join('، ');

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`w-full p-[18px] gap-3.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${itemsStart} ${
        onPress ? 'active:opacity-80' : ''
      }`}
      style={{ borderCurve: 'continuous' }}
    >
      <View className={`w-full ${rowStart} items-center gap-2.5`}>
        <View
          className="w-10 h-10 rounded-md bg-primary-subtle dark:bg-primary-subtle-dark items-center justify-center"
          style={{ borderCurve: 'continuous' }}
        >
          <Icon name="layers" size={20} tone="brand" />
        </View>
        <View className={`flex-1 ${itemsStart}`}>
          <Text
            numberOfLines={1}
            className={`w-full ${typography.headingSm} text-right text-fg dark:text-fg-dark`}
            maxFontSizeMultiplier={1.6}
          >
            {group.name}
          </Text>
          {meta ? (
            <Text
              numberOfLines={1}
              testID={`${testID}-meta`}
              className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
              maxFontSizeMultiplier={1.6}
            >
              {meta}
            </Text>
          ) : null}
        </View>
        {onPress ? (
          <Icon name="chevron-left" size={18} tone="tertiary" />
        ) : null}
      </View>

      <View className={`w-full ${rowStart} gap-2 items-stretch`}>
        <GroupMetric
          label={AVERAGE_LABEL}
          value={average}
          testID={`${testID}-average`}
        />
        <GroupMetric
          label={AT_RISK_LABEL}
          value={String(group.at_risk_count)}
          tone={group.at_risk_count > 0 ? 'error' : 'default'}
          testID={`${testID}-at-risk`}
        />
        <GroupMetric
          label={SUBMISSION_LABEL}
          value={submission}
          testID={`${testID}-submission`}
        />
      </View>
    </Pressable>
  );
}

interface GroupMetricProps {
  label: string;
  /** `null` renders the null state — never a substituted `0`. */
  value: string | null;
  tone?: 'default' | 'error';
  testID: string;
}

/** Figma 37:50 — a canvas-tinted 10px-radius cell inside the card. */
function GroupMetric({
  label,
  value,
  tone = 'default',
  testID,
}: GroupMetricProps) {
  const isNull = value === null;
  return (
    <View
      testID={testID}
      className={`flex-1 px-3 py-2.5 rounded-sm bg-canvas dark:bg-canvas-dark ${itemsStart}`}
      style={{ borderCurve: 'continuous' }}
    >
      <Text
        testID={`${testID}-value`}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.5}
        className={`w-full ${typography.headingMd} text-right ${
          isNull
            ? 'text-fg-tertiary dark:text-fg-tertiary-dark'
            : tone === 'error'
              ? 'text-fg-error'
              : 'text-fg dark:text-fg-dark'
        }`}
      >
        {value ?? METRIC_TILE_NULL_VALUE}
      </Text>
      <Text
        testID={`${testID}-label`}
        numberOfLines={1}
        maxFontSizeMultiplier={1.5}
        className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {label}
      </Text>
    </View>
  );
}
