import React from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import {
  SheetHandle,
  SegmentedControl,
  Button,
  Banner,
  Icon,
} from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { UserListItem } from '@/shared/api/users.client';

export interface StaffPickerSection {
  key: string;
  /** Segment label, e.g. "المعلّم". */
  label: string;
  /** Caption under a candidate that is not the current one, e.g. "معلّم". */
  roleLabel: string;
  candidates: UserListItem[];
  selectedId: string | null;
  /** The staff member currently assigned — captioned "الحالي". */
  currentId?: string | null;
  /** Factual empty copy when no user holds the role. */
  emptyMessage: string;
}

export interface StaffPickerSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  sections: StaffPickerSection[];
  activeKey: string;
  onChangeSection?: (key: string) => void;
  onSelect: (sectionKey: string, id: string) => void;
  onClose: () => void;
  /** Present = a confirm CTA at the bottom; absent = selecting closes. */
  confirmLabel?: string;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  /** Overrides the confirm CTA's testID (default `${testID}-confirm`). */
  confirmTestID?: string;
  /** Submission error shown inside the sheet (icon + text, UF §32). */
  error?: string | null;
  testID?: string;
  optionTestID: (sectionKey: string, id: string) => string;
}

/** Figma shadow/sheet — 0 −8 32 rgba(0,0,0,0.14). */
const SHEET_SHADOW = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: -8 },
  shadowRadius: 16,
  shadowOpacity: 0.14,
  elevation: 12,
} as const;

/**
 * Figma "Reassign staff sheet" (52:888) and the SCR-28 staff picker: a
 * bottom sheet listing the users holding the matching role. Selected row =
 * bg/primary-subtle + 1.5px border/brand + check; the current assignee is
 * captioned "الحالي". Group counts per user are not exposed by the API and
 * are therefore not shown.
 */
export function StaffPickerSheet({
  visible,
  title,
  subtitle,
  sections,
  activeKey,
  onChangeSection,
  onSelect,
  onClose,
  confirmLabel,
  onConfirm,
  confirmDisabled = false,
  confirmLoading = false,
  confirmTestID,
  error,
  testID = 'staff-picker-sheet',
  optionTestID,
}: StaffPickerSheetProps) {
  const section = sections.find((s) => s.key === activeKey) ?? sections[0];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={confirmLoading ? undefined : onClose}
      testID={testID}
    >
      <View className="flex-1 justify-end">
        <Pressable
          testID={`${testID}-scrim`}
          onPress={confirmLoading ? undefined : onClose}
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
              className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          {sections.length > 1 && onChangeSection ? (
            <SegmentedControl
              options={sections.map((s) => ({ label: s.label, value: s.key }))}
              value={section?.key ?? null}
              onChange={onChangeSection}
              disabled={confirmLoading}
              accessibilityLabel="الدور"
              testID={`${testID}-role`}
            />
          ) : null}

          {error ? (
            <Banner tone="error" message={error} testID={`${testID}-error`} />
          ) : null}

          <ScrollView
            className="w-full max-h-[320px]"
            contentContainerStyle={{ gap: 6 }}
            keyboardShouldPersistTaps="handled"
          >
            {section && section.candidates.length === 0 ? (
              <Text
                className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark py-2`}
                testID={`${testID}-empty`}
              >
                {section.emptyMessage}
              </Text>
            ) : null}
            {section?.candidates.map((candidate) => {
              const isSelected = section.selectedId === candidate.id;
              const isCurrent = section.currentId === candidate.id;
              const name = candidate.full_name || candidate.email;
              return (
                <Pressable
                  key={candidate.id}
                  testID={optionTestID(section.key, candidate.id)}
                  accessibilityRole="radio"
                  accessibilityState={{
                    selected: isSelected,
                    disabled: confirmLoading,
                  }}
                  accessibilityLabel={`${name}${isCurrent ? ' (الحالي)' : ''}`}
                  disabled={confirmLoading}
                  onPress={() => onSelect(section.key, candidate.id)}
                  className={`${rowStart} items-center gap-2.5 px-3.5 py-3 rounded-md w-full active:opacity-80 ${
                    isSelected
                      ? 'bg-primary-subtle dark:bg-primary-subtle-dark border-[1.5px] border-line-brand dark:border-line-brand-dark'
                      : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                >
                  <View className="w-8 h-8 rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center">
                    <Icon name="shield" size={16} tone="secondary" />
                  </View>
                  <View className={`flex-1 ${itemsStart}`}>
                    <Text
                      numberOfLines={1}
                      className={`w-full ${typography.bodyMdMedium} text-right ${
                        isSelected
                          ? 'text-brand dark:text-brand-dark'
                          : 'text-fg dark:text-fg-dark'
                      }`}
                    >
                      {name}
                    </Text>
                    <Text
                      className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                    >
                      {isCurrent ? 'الحالي' : section.roleLabel}
                    </Text>
                  </View>
                  {isSelected ? (
                    <Icon name="check" size={18} tone="brand" />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {confirmLabel && onConfirm ? (
            <Button
              label={confirmLabel}
              onPress={onConfirm}
              disabled={confirmDisabled || confirmLoading}
              loading={confirmLoading}
              testID={confirmTestID ?? `${testID}-confirm`}
              className="w-full"
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
