import React from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { Icon } from '@/shared/components/Icon';
import { ListRow } from '@/shared/components/ListRow';
import { SheetHandle } from '@/shared/components/SheetHandle';
import { typography } from '@/shared/theme/typography';
import { SHADOW_FLOATING } from '@/shared/theme/colors';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { GroupListItem } from '@/shared/api/groups.client';

export const GROUP_PICKER_TITLE = 'اختر المجموعة';

export interface GroupLedgerSelectorProps {
  group: GroupListItem | null;
  /** Every group assigned to the caller; a picker opens only above one. */
  groups: GroupListItem[];
  /** "18 طالبًا · 4 متابعات"; null while the ledger is still loading. */
  summary: string | null;
  onSelect: (groupId: string) => void;
  testID?: string;
}

/**
 * Figma SCR-20 GroupSelector (36:430): a surface card carrying the group
 * being shown, its ledger summary and the layers glyph, with a chevron-down
 * on the trailing side.
 *
 * UF §18 makes the *selector* conditional — "[Group selector, only if >1
 * assigned group]" — so with a single assigned group the card stays as the
 * ledger's header but is inert and drops the chevron, which would otherwise
 * promise a choice that does not exist. Figma draws no picker sheet for
 * this screen, so it follows SCR-07's sheet pattern (SheetHandle + rows).
 */
export function GroupLedgerSelector({
  group,
  groups,
  summary,
  onSelect,
  testID = 'payments-group-selector',
}: GroupLedgerSelectorProps) {
  const [isPickerOpen, setPickerOpen] = React.useState(false);
  const canSwitch = groups.length > 1;

  const card = (
    <>
      <View
        className="w-5 h-5 items-center justify-center"
        testID={`${testID}-layers`}
      >
        <Icon name="layers" size={20} tone="brand" />
      </View>
      <View className={`flex-1 ${itemsStart}`}>
        <Text
          numberOfLines={1}
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
          testID={`${testID}-name`}
        >
          {group?.name ?? ''}
        </Text>
        {summary ? (
          <Text
            numberOfLines={1}
            className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID={`${testID}-summary`}
          >
            {summary}
          </Text>
        ) : null}
      </View>
      {canSwitch ? (
        <Icon
          name="chevron-down"
          size={18}
          tone="tertiary"
          testID={`${testID}-chevron`}
        />
      ) : null}
    </>
  );

  const cardClass = `${rowStart} items-center w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-3.5 py-3 gap-2.5`;

  return (
    <>
      {canSwitch ? (
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={`${GROUP_PICKER_TITLE}، ${group?.name ?? ''}`}
          onPress={() => setPickerOpen(true)}
          className={`${cardClass} active:opacity-80`}
          style={{ borderCurve: 'continuous' }}
        >
          {card}
        </Pressable>
      ) : (
        <View
          testID={testID}
          className={cardClass}
          style={{ borderCurve: 'continuous' }}
        >
          {card}
        </View>
      )}

      <Modal
        visible={isPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
        testID={`${testID}-picker`}
      >
        <View className="flex-1 justify-end">
          <Pressable
            testID={`${testID}-picker-backdrop`}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            onPress={() => setPickerOpen(false)}
            className="absolute inset-0 bg-gray-950/45"
          />
          <View
            testID={`${testID}-picker-sheet`}
            className={`w-full bg-surface dark:bg-surface-dark rounded-t-[28px] px-5 pb-10 gap-4 ${itemsStart}`}
            style={[SHADOW_FLOATING, { borderCurve: 'continuous' }]}
          >
            <SheetHandle />
            <Text
              accessibilityRole="header"
              className={`w-full ${typography.headingMd} text-right text-fg dark:text-fg-dark`}
            >
              {GROUP_PICKER_TITLE}
            </Text>
            <ScrollView
              className="w-full max-h-96"
              contentContainerStyle={{ gap: 10 }}
            >
              {groups.map((item) => (
                <ListRow
                  key={item.id}
                  title={item.name}
                  leadingIcon="layers"
                  trailing={item.id === group?.id ? 'badge' : 'none'}
                  badge={{ status: 'معروضة', variant: 'success' }}
                  onPress={() => {
                    setPickerOpen(false);
                    onSelect(item.id);
                  }}
                  testID={`${testID}-option-${item.id}`}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
