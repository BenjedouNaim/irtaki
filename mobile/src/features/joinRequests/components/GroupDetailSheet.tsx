import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { Button } from '@/shared/components/Button';
import { Banner } from '@/shared/components/Banner';
import { SheetHandle } from '@/shared/components/SheetHandle';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { typography } from '@/shared/theme/typography';
import { SHADOW_FLOATING } from '@/shared/theme/colors';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { GroupListItemLimited } from '@/shared/api/groups.client';

export interface GroupDetailSheetProps {
  visible: boolean;
  group: GroupListItemLimited | null;
  /** Arabic weekday name of `group.recitation_day`. */
  recitationDayName: string;
  onApply: () => void;
  onClose: () => void;
  testID?: string;
}

/** UF §11 — group closed/archived between listing and detail tap. */
const UNAVAILABLE_MESSAGE =
  'أُغلق التسجيل أو أُرشفت المجموعة منذ تحميل القائمة. ستُحدَّث القائمة عند الإغلاق.';

/**
 * Figma SCR-07 Group Detail sheet (23:244) and · no longer available
 * (54:4636): name + enrollment badge, recitation day, primary "Apply".
 * Teacher/assistant/capacity are deliberately absent (UF §12).
 */
export function GroupDetailSheet({
  visible,
  group,
  recitationDayName,
  onApply,
  onClose,
  testID = 'group-detail-modal',
}: GroupDetailSheetProps) {
  const available = group?.enrollment_status === 'Open';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      testID={testID}
    >
      <View className="flex-1 justify-end">
        <Pressable
          testID="close-detail-button"
          accessibilityRole="button"
          accessibilityLabel="إغلاق"
          onPress={onClose}
          className="absolute inset-0 bg-gray-950/45"
        />

        <View
          testID={`${testID}-sheet`}
          className={`w-full bg-surface dark:bg-surface-dark rounded-t-[28px] px-5 pb-10 gap-4 ${itemsStart}`}
          style={[SHADOW_FLOATING, { borderCurve: 'continuous' }]}
        >
          <SheetHandle />

          <View
            className={`${rowStart} items-center justify-between gap-3 w-full`}
          >
            <Text
              numberOfLines={1}
              className={`flex-1 ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
              testID={`${testID}-title`}
            >
              {group?.name ?? ''}
            </Text>
            <StatusBadge
              status={available ? 'التسجيل مفتوح' : 'التسجيل مغلق'}
              variant={available ? 'success' : 'neutral'}
              testID={`${testID}-badge`}
              style={{ alignSelf: 'center' }}
            />
          </View>

          <View className={`${rowStart} items-center gap-2 w-full`}>
            <Text
              className={`${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            >
              يوم التسميع
            </Text>
            <Text
              className={`${typography.bodyLg} text-right text-fg dark:text-fg-dark`}
              testID={`${testID}-day`}
            >
              {recitationDayName}
            </Text>
          </View>

          {!available ? (
            <Banner
              tone="warning"
              message={UNAVAILABLE_MESSAGE}
              testID={`${testID}-unavailable-banner`}
            />
          ) : null}

          <View className="h-2" />

          <Button
            label={
              available ? 'التقديم لهذه المجموعة' : 'لم تعد هذه المجموعة متاحة'
            }
            onPress={onApply}
            disabled={!available}
            testID="apply-group-button"
            className="w-full"
          />
        </View>
      </View>
    </Modal>
  );
}
