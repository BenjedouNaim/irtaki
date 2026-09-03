import React from 'react';
import { View, Text } from 'react-native';
import { Icon } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { AuditEntry } from '@/shared/api/audit.client';
import {
  auditActionIcon,
  auditActionLabel,
  auditActorName,
  formatAuditTimestamp,
} from '../utils/auditEntry';

export interface AuditEntryRowProps {
  entry: AuditEntry;
  /** Injectable clock so "اليوم"/"أمس" are testable. */
  now?: Date;
  testID?: string;
}

/**
 * SCR-33's entry (Figma 42:607): the action glyph in a 32dp circle on the
 * reading side, the action name over the actor's name in the middle, and
 * the timestamp on the far side. Not a control — UF §26 gives the audit log
 * no destination, and there is no per-entry detail screen.
 *
 * The frame's second line reads as a sentence ("الشيخ عبد الرحمن فتح
 * التسجيل في حلقة الفجر"); API-054 returns no group name and no toggle
 * direction, only `actor: { id, full_name }` and an opaque `target_id`, so
 * the line carries the actor's name alone rather than a fabricated sentence.
 */
export function AuditEntryRow({
  entry,
  now,
  testID = `audit-entry-${entry.id}`,
}: AuditEntryRowProps) {
  const label = auditActionLabel(entry.action);
  const actor = auditActorName(entry.actor.full_name);
  const timestamp = formatAuditTimestamp(entry.occurred_at, now);

  return (
    <View
      testID={testID}
      accessibilityLabel={`${label}، ${actor}، ${timestamp}`}
      className={`${rowStart} items-start gap-3 w-full py-3.5`}
    >
      <View
        testID={`${testID}-icon`}
        className="w-8 h-8 rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center"
      >
        <Icon name={auditActionIcon(entry.action)} size={16} tone="brand" />
      </View>

      <View className={`flex-1 gap-0.5 ${itemsStart}`}>
        <Text
          testID={`${testID}-action`}
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
          maxFontSizeMultiplier={1.6}
        >
          {label}
        </Text>
        <Text
          testID={`${testID}-actor`}
          className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          maxFontSizeMultiplier={1.6}
        >
          {actor}
        </Text>
      </View>

      <Text
        testID={`${testID}-timestamp`}
        numberOfLines={1}
        className={`${typography.caption} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
        maxFontSizeMultiplier={1.6}
      >
        {timestamp}
      </Text>
    </View>
  );
}
