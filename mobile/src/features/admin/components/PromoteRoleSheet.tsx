import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { Banner, Button, Icon, SheetHandle } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { PromotableRole } from '@/shared/api/users.client';

/**
 * The two promotion targets, in Figma's reading order (Teacher rightmost).
 * Captions name what the role unlocks, exactly as 52:1193 writes them.
 */
export const PROMOTABLE_ROLE_OPTIONS: ReadonlyArray<{
  role: PromotableRole;
  label: string;
  caption: string;
}> = [
  {
    role: 'Teacher',
    label: 'معلّم',
    caption: 'الأداء والتقارير والتسجيل',
  },
  {
    role: 'Assistant',
    label: 'مساعد',
    caption: 'طلبات الانضمام والمدفوعات',
  },
];

/** Arabic label for a target role, used by the sheet and the confirm dialog. */
export function promotableRoleLabel(role: PromotableRole): string {
  return (
    PROMOTABLE_ROLE_OPTIONS.find((option) => option.role === role)?.label ??
    role
  );
}

/** Figma shadow/sheet — 0 −8 32 rgba(0,0,0,0.14). */
const SHEET_SHADOW = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: -8 },
  shadowRadius: 16,
  shadowOpacity: 0.14,
  elevation: 12,
} as const;

export interface PromoteRoleSheetProps {
  visible: boolean;
  /** Display name of the user being promoted, already resolved by the caller. */
  userName: string;
  /** `null` until the Admin picks one — the CTA stays disabled meanwhile. */
  selectedRole: PromotableRole | null;
  onSelectRole: (role: PromotableRole) => void;
  onContinue: () => void;
  onClose: () => void;
  /** Blocks the sheet while the promotion is in flight. */
  busy?: boolean;
  /** Submission error, shown as icon + text inside the sheet (UF §32). */
  error?: string | null;
  testID?: string;
}

/**
 * Figma "SCR-32 · Promote: choose role sheet" (52:1193). Two role cards
 * (selected = bg/primary-subtle + 1.5px border/brand + filled icon disc) and
 * a full-width CTA. Nothing is pre-selected: with only two options and a
 * one-directional transition, a default would put the wrong role one tap from
 * the confirm dialog.
 */
export function PromoteRoleSheet({
  visible,
  userName,
  selectedRole,
  onSelectRole,
  onContinue,
  onClose,
  busy = false,
  error,
  testID = 'promote-role-sheet',
}: PromoteRoleSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={busy ? undefined : onClose}
      testID={testID}
    >
      <View className="flex-1 justify-end">
        <Pressable
          testID={`${testID}-scrim`}
          onPress={busy ? undefined : onClose}
          className="absolute inset-0 bg-black/45"
          accessibilityRole="button"
          accessibilityLabel="إغلاق"
        />
        <View
          testID={`${testID}-container`}
          className={`w-full bg-surface dark:bg-surface-dark rounded-t-[28px] px-5 pb-10 gap-3.5 ${itemsStart}`}
          style={SHEET_SHADOW}
        >
          <SheetHandle />

          <View className={`w-full gap-0.5 ${itemsStart}`}>
            <Text
              accessibilityRole="header"
              testID={`${testID}-title`}
              className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
            >
              {`ترقية ${userName}`}
            </Text>
            <Text
              className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            >
              اختر الدور. الترقية باتجاه واحد في هذه النسخة — لا تنزيل.
            </Text>
          </View>

          {error ? (
            <Banner tone="error" message={error} testID={`${testID}-error`} />
          ) : null}

          <View className={`${rowStart} w-full items-stretch gap-2.5`}>
            {PROMOTABLE_ROLE_OPTIONS.map((option) => {
              const isSelected = selectedRole === option.role;
              return (
                <Pressable
                  key={option.role}
                  testID={`${testID}-option-${option.role}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, disabled: busy }}
                  accessibilityLabel={`${option.label} — ${option.caption}`}
                  disabled={busy}
                  onPress={() => onSelectRole(option.role)}
                  className={`flex-1 items-center gap-2 px-3 py-[18px] rounded-lg active:opacity-80 ${
                    isSelected
                      ? 'bg-primary-subtle dark:bg-primary-subtle-dark border-[1.5px] border-line-brand dark:border-line-brand-dark'
                      : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <View
                    className={`w-11 h-11 rounded-full items-center justify-center ${
                      isSelected
                        ? 'bg-primary dark:bg-primary-dark'
                        : 'bg-subtle dark:bg-subtle-dark'
                    }`}
                  >
                    <Icon
                      name="shield"
                      size={20}
                      tone={isSelected ? 'on-primary' : 'secondary'}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.5}
                    className={`${typography.headingSm} text-center ${
                      isSelected
                        ? 'text-brand dark:text-brand-dark'
                        : 'text-fg dark:text-fg-dark'
                    }`}
                  >
                    {option.label}
                  </Text>
                  <Text
                    className={`w-full ${typography.caption} text-center text-fg-secondary dark:text-fg-secondary-dark`}
                  >
                    {option.caption}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Button
            label="متابعة"
            onPress={onContinue}
            disabled={selectedRole === null || busy}
            loading={busy}
            testID={`${testID}-continue`}
            className="w-full"
          />
        </View>
      </View>
    </Modal>
  );
}
