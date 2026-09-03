import React from 'react';
import { View, Text } from 'react-native';
import { Icon, IconName, StatusBadge } from '@/shared/components';
import { StatusBadgeVariant } from '@/shared/components/StatusBadge';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { UserListItem } from '@/shared/api/users.client';
import { PromoteUserAction, canPromoteUser } from './PromoteUserAction';

/**
 * The five roles of E-01 User in Arabic. Figma writes the label in the
 * grammatical gender of the person shown (معلّم / معلّمة); API-053 returns
 * no gender, so the unmarked masculine form stands for every row.
 */
const ROLE_LABELS: Record<string, string> = {
  Admin: 'مدير',
  Teacher: 'معلّم',
  Assistant: 'مساعد',
  Student: 'طالب',
  User: 'مستخدم',
};

/** Figma 42:437 — staff wear the shield, a Student the cap, a User the bust. */
const ROLE_ICONS: Record<string, IconName> = {
  Admin: 'shield',
  Teacher: 'shield',
  Assistant: 'shield',
  Student: 'graduation',
  User: 'user',
};

/**
 * Figma tones: Teacher success, Assistant info, Student neutral. Admin has
 * no row in the frame; it takes the neutral tone, the one that asserts no
 * state (UF §30 — a badge is never colour alone anyway, the label carries
 * the meaning).
 */
const ROLE_TONES: Record<string, StatusBadgeVariant> = {
  Admin: 'neutral',
  Teacher: 'success',
  Assistant: 'info',
  Student: 'neutral',
  User: 'neutral',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export interface UserDirectoryRowProps {
  user: UserListItem;
  /** Fired with the updated user after a successful promotion. */
  onPromoted?: (user: UserListItem) => void;
  testID?: string;
}

/**
 * SCR-32's user row (Figma 42:437): avatar on the reading side, name over a
 * meta line, and on the far side either the role badge or — on a `role=User`
 * row, and only there — the promote action (BR-R03). The row itself is not
 * a control: UF §26 gives Staff/Users exactly one destination, the promote
 * confirmation, and there is no per-user detail screen to open.
 *
 * The frame's meta line is "role · group context"; no group count or group
 * name is available from API-053 (`{ id, email, full_name, role }`), so the
 * account's email takes that slot when it is not already the title.
 */
export function UserDirectoryRow({
  user,
  onPromoted,
  testID = `user-row-${user.id}`,
}: UserDirectoryRowProps) {
  const label = roleLabel(user.role);
  const hasName = Boolean(user.full_name && user.full_name.trim().length > 0);
  const title = hasName ? (user.full_name as string) : user.email;
  const subtitle = hasName ? `${label} · ${user.email}` : label;
  const promotable = canPromoteUser(user);

  return (
    <View
      testID={testID}
      className={`${rowStart} items-center gap-2.5 w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-3.5 py-3`}
      style={{ borderCurve: 'continuous' }}
    >
      <View
        testID={`${testID}-avatar`}
        className={`w-9 h-9 rounded-full items-center justify-center ${
          promotable || user.role === 'Student'
            ? 'bg-subtle dark:bg-subtle-dark'
            : 'bg-primary-subtle dark:bg-primary-subtle-dark'
        }`}
      >
        <Icon
          name={ROLE_ICONS[user.role] ?? 'user'}
          size={18}
          tone={promotable || user.role === 'Student' ? 'secondary' : 'brand'}
        />
      </View>

      <View className={`flex-1 gap-0.5 ${itemsStart}`}>
        <Text
          testID={`${testID}-title`}
          numberOfLines={1}
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
          maxFontSizeMultiplier={1.6}
        >
          {title}
        </Text>
        <Text
          testID={`${testID}-subtitle`}
          numberOfLines={1}
          className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          maxFontSizeMultiplier={1.6}
        >
          {subtitle}
        </Text>
      </View>

      {promotable ? (
        <PromoteUserAction
          user={user}
          onPromoted={onPromoted}
          testID={`promote-user-${user.id}`}
        />
      ) : (
        <StatusBadge
          status={label}
          variant={ROLE_TONES[user.role] ?? 'neutral'}
          testID={`${testID}-badge`}
        />
      )}
    </View>
  );
}
