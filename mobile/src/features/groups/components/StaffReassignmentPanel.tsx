import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button, Banner, Icon } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import {
  reassignStaff,
  GroupListItemFull,
  GroupStaff,
} from '@/shared/api/groups.client';
import { listUsersByRole, UserListItem } from '@/shared/api/users.client';
import { ApiError } from '@/shared/api/types';
import { StaffPickerSheet } from './StaffPickerSheet';

export interface StaffReassignmentPanelProps {
  groupId: string;
  currentTeacher: GroupStaff;
  currentAssistant: GroupStaff;
  onReassigned?: (updatedGroup: GroupListItemFull) => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

type StaffRole = 'teacher' | 'assistant';

function StaffRow({
  name,
  role,
  testID,
}: {
  name: string | null;
  role: string;
  testID: string;
}) {
  return (
    <View className={`${rowStart} items-center gap-2.5 w-full`}>
      <View className="w-9 h-9 rounded-full bg-primary-subtle dark:bg-primary-subtle-dark items-center justify-center">
        <Icon name="user" size={18} tone="brand" />
      </View>
      <View className={`flex-1 ${itemsStart}`}>
        <Text
          numberOfLines={1}
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
          testID={testID}
        >
          {name || 'غير محدد'}
        </Text>
        <Text
          className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        >
          {role}
        </Text>
      </View>
    </View>
  );
}

/**
 * Figma SCR-29 Staff card (41:246) + Reassign staff sheet (52:888): the
 * current Teacher/Assistant, an outline CTA opening the sheet, the sheet's
 * role segments and candidate list, and one atomic `PATCH /groups/{id}/staff`
 * carrying only the roles that changed.
 */
export function StaffReassignmentPanel({
  groupId,
  currentTeacher,
  currentAssistant,
  onReassigned,
  className,
  style,
}: StaffReassignmentPanelProps) {
  // Staff options state
  const [teachers, setTeachers] = useState<UserListItem[]>([]);
  const [assistants, setAssistants] = useState<UserListItem[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Sheet + selection state
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<StaffRole>('teacher');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    currentTeacher.id,
  );
  const [selectedAssistantId, setSelectedAssistantId] = useState<string>(
    currentAssistant.id,
  );

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Update selection when props change
  useEffect(() => {
    setSelectedTeacherId(currentTeacher.id);
  }, [currentTeacher.id]);

  useEffect(() => {
    setSelectedAssistantId(currentAssistant.id);
  }, [currentAssistant.id]);

  const fetchStaff = useCallback(async () => {
    setIsLoadingStaff(true);
    setFetchError(null);
    try {
      const [teachersRes, assistantsRes] = await Promise.all([
        listUsersByRole('Teacher'),
        listUsersByRole('Assistant'),
      ]);
      setTeachers(teachersRes.data);
      setAssistants(assistantsRes.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(
          err.message || 'تعذر تحميل قائمة الكادر الإداري والتعليمي',
        );
      } else {
        setFetchError('تعذر الاتصال بالخادم لتحميل قائمة المعلمين والمساعدين.');
      }
    } finally {
      setIsLoadingStaff(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const triggerHaptic = () => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.selectionAsync();
      } catch {
        // Ignored
      }
    }
  };

  const handleOpenSheet = () => {
    setErrorMessage(null);
    setActiveRole('teacher');
    setIsSheetOpen(true);
  };

  const handleCloseSheet = () => {
    if (isSubmitting) return;
    setIsSheetOpen(false);
    setErrorMessage(null);
    setSelectedTeacherId(currentTeacher.id);
    setSelectedAssistantId(currentAssistant.id);
  };

  const handleSelect = (sectionKey: string, id: string) => {
    triggerHaptic();
    if (sectionKey === 'teacher') {
      setSelectedTeacherId(id);
    } else {
      setSelectedAssistantId(id);
    }
    if (errorMessage) setErrorMessage(null);
  };

  const isChanged =
    selectedTeacherId !== currentTeacher.id ||
    selectedAssistantId !== currentAssistant.id;

  const handleSave = async () => {
    if (!isChanged) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: { teacher_id?: string; assistant_id?: string } = {};
    if (selectedTeacherId !== currentTeacher.id) {
      payload.teacher_id = selectedTeacherId;
    }
    if (selectedAssistantId !== currentAssistant.id) {
      payload.assistant_id = selectedAssistantId;
    }

    try {
      const response = await reassignStaff(groupId, payload);

      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        } catch {
          // Ignored
        }
      }

      setIsSheetOpen(false);
      onReassigned?.(response.data as GroupListItemFull);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 422 && err.details && err.details.length > 0) {
          setErrorMessage(err.details[0].message);
        } else {
          setErrorMessage(err.message || 'حدث خطأ أثناء إعادة إسناد الطاقم');
        }
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View
      testID="staff-reassignment-panel"
      className={`w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-[18px] py-4 gap-2.5 ${itemsStart} ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <Text
        className={`w-full ${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        الطاقم
      </Text>

      <StaffRow
        name={currentTeacher.full_name}
        role="المعلّم"
        testID="staff-current-teacher"
      />
      <StaffRow
        name={currentAssistant.full_name}
        role="المساعد"
        testID="staff-current-assistant"
      />

      {fetchError ? (
        <Banner
          tone="error"
          message={fetchError}
          onRetry={fetchStaff}
          testID="staff-reassign-fetch-error"
          retryLabel="إعادة المحاولة"
        />
      ) : null}

      <View
        className="w-full"
        testID={isLoadingStaff ? 'staff-reassign-loading' : undefined}
      >
        <Button
          label="إعادة إسناد الطاقم"
          variant="outline"
          onPress={handleOpenSheet}
          loading={isLoadingStaff}
          disabled={isLoadingStaff || Boolean(fetchError)}
          testID="staff-reassign-open-button"
          className="w-full h-11"
        />
      </View>

      <StaffPickerSheet
        visible={isSheetOpen}
        title="إعادة إسناد الطاقم"
        subtitle="تبديل ذرّي — يتغيّر نطاق الوصول فورًا. الاختيار من قائمة المستخدمين بالدور المطابق."
        sections={[
          {
            key: 'teacher',
            label: 'المعلّم',
            roleLabel: 'معلّم',
            candidates: teachers,
            selectedId: selectedTeacherId,
            currentId: currentTeacher.id,
            emptyMessage: 'لا يوجد معلمون مسجلون حاليًا',
          },
          {
            key: 'assistant',
            label: 'المساعد',
            roleLabel: 'مساعد',
            candidates: assistants,
            selectedId: selectedAssistantId,
            currentId: currentAssistant.id,
            emptyMessage: 'لا يوجد مساعدون إداريون مسجلون حاليًا',
          },
        ]}
        activeKey={activeRole}
        onChangeSection={(key) => setActiveRole(key as StaffRole)}
        onSelect={handleSelect}
        onClose={handleCloseSheet}
        confirmLabel="تأكيد الإسناد"
        onConfirm={handleSave}
        confirmDisabled={!isChanged}
        confirmLoading={isSubmitting}
        confirmTestID="reassign-staff-save-button"
        error={errorMessage}
        testID="reassign-staff"
        optionTestID={(key, id) => `reassign-${key}-option-${id}`}
      />
    </View>
  );
}
