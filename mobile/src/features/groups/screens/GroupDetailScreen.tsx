import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  TopBar,
  Button,
  Banner,
  Toast,
  Icon,
  ListRow,
  StatusBadge,
  FormField,
  SkeletonLoader,
  getInputClassName,
} from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { useThemeColors } from '@/shared/theme/colors';
import { rowStart } from '@/shared/theme/rtl';
import {
  getGroupDetail,
  updateGroupName,
  GroupListItemFull,
} from '@/shared/api/groups.client';
import { useAuthStore } from '@/shared/auth/authStore';
import { ApiError } from '@/shared/api/types';
import { StaffReassignmentPanel } from '../components/StaffReassignmentPanel';
import { GroupLifecyclePanel } from '../components/GroupLifecyclePanel';
import { DeleteGroupPanel } from '../components/DeleteGroupPanel';
import { EnrollmentToggle } from '../components/EnrollmentToggle';
import { getRecitationDayName } from '@/features/joinRequests/screens/JoinStepperScreen';

export interface GroupDetailScreenProps {
  groupId: string;
}

/** Rename pill is 30px tall; the slop reaches the 48dp target (UF §32). */
const RENAME_HIT_SLOP = { top: 9, bottom: 9, left: 4, right: 4 };

/**
 * SCR-29 Group Detail · Admin (Figma 41:207, inline rename 52:797). The
 * "الأداء والتقارير" row of the frame needs the unbuilt performance module
 * and the roster row's member counts are not in the group payload, so
 * neither is rendered. The group's creation month is not exposed either;
 * the meta line carries day and gender only.
 */
export function GroupDetailScreen({ groupId }: GroupDetailScreenProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const role = useAuthStore((s) => s.role);
  const [group, setGroup] = useState<GroupListItemFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inline rename state
  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getGroupDetail(groupId);
      setGroup(response.data as GroupListItemFull);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل تفاصيل المجموعة');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  const handleStartEditing = () => {
    if (!group) return;
    setNameDraft(group.name);
    setRenameError(null);
    setToastMessage(null);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setRenameError(null);
    setNameDraft(group?.name || '');
  };

  const handleOpenRoster = () => {
    router.push({
      pathname: '/(app)/admin/groups/[id]/roster' as any,
      params: { id: groupId, name: group?.name ?? '' },
    });
  };

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setRenameError('اسم المجموعة مطلوب');
      return;
    }

    setIsRenaming(true);
    setRenameError(null);

    try {
      const response = await updateGroupName(groupId, { name: trimmed });
      setGroup(response.data as GroupListItemFull);
      setIsEditing(false);
      setToastMessage('تم تحديث اسم المجموعة');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 409) {
          setRenameError('اسم المجموعة مستخدم بالفعل');
        } else if (err.statusCode === 422) {
          if (err.details && err.details.length > 0) {
            setRenameError(err.details[0].message);
          } else {
            setRenameError(err.message || 'اسم المجموعة غير صالح');
          }
        } else {
          setRenameError(err.message || 'حدث خطأ أثناء تحديث اسم المجموعة');
        }
      } else {
        setRenameError('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsRenaming(false);
    }
  };

  const title = isEditing ? 'تعديل الاسم' : (group?.name ?? '');

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="group-detail-screen"
    >
      <TopBar
        title={title}
        onBack={isEditing ? handleCancelEditing : undefined}
        testID="group-detail-top-bar"
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {isLoading ? (
          <View testID="group-detail-skeleton" className="gap-4">
            <SkeletonLoader variant="card" />
            <SkeletonLoader count={3} variant="row" />
          </View>
        ) : errorMessage ? (
          <Banner
            tone="error"
            message={errorMessage}
            onRetry={fetchDetail}
            testID="group-detail-error"
          />
        ) : group ? (
          <>
            {/* Header: meta (right) · badges · rename pill (left) */}
            <View className={`${rowStart} items-center gap-2 w-full`}>
              <Text
                numberOfLines={1}
                className={`flex-1 ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                testID="group-detail-meta"
              >
                {`${getRecitationDayName(group.recitation_day)} · ${
                  group.gender === 'Male' ? 'ذكور' : 'إناث'
                }`}
              </Text>
              <View className={`${rowStart} items-center gap-1.5`}>
                <StatusBadge
                  status={
                    group.lifecycle_state === 'Active' ? 'نشطة' : 'مؤرشفة'
                  }
                  variant={
                    group.lifecycle_state === 'Active' ? 'success' : 'neutral'
                  }
                  testID="group-detail-lifecycle-badge"
                />
                <StatusBadge
                  status={
                    group.enrollment_status === 'Open'
                      ? 'التسجيل مفتوح'
                      : 'التسجيل مغلق'
                  }
                  variant={
                    group.enrollment_status === 'Open' ? 'success' : 'neutral'
                  }
                  testID="group-detail-enrollment-badge"
                />
              </View>
              {role === 'Admin' && !isEditing ? (
                <Pressable
                  onPress={handleStartEditing}
                  hitSlop={RENAME_HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="تعديل اسم المجموعة"
                  testID="group-detail-name-edit-button"
                  className={`${rowStart} items-center gap-1.5 rounded-full bg-subtle dark:bg-subtle-dark px-2.5 py-1.5 active:opacity-80`}
                >
                  <Text
                    className={`${typography.labelSm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                  >
                    تعديل الاسم
                  </Text>
                  <Icon name="pen" size={14} tone="secondary" />
                </Pressable>
              ) : null}
            </View>

            {isEditing ? (
              <View
                className="w-full gap-2.5"
                testID="group-detail-edit-container"
              >
                <FormField
                  label="اسم المجموعة"
                  required
                  helpText="يجب أن يكون فريدًا · الحقل الوحيد القابل للتعديل"
                  error={renameError ?? undefined}
                  className="mb-0"
                >
                  <TextInput
                    testID="group-detail-name-input"
                    className={getInputClassName({
                      error: Boolean(renameError),
                      focused: true,
                    })}
                    style={{ borderCurve: 'continuous' }}
                    value={nameDraft}
                    onChangeText={(text) => {
                      setNameDraft(text);
                      if (renameError) setRenameError(null);
                    }}
                    placeholder="اسم المجموعة"
                    placeholderTextColor={colors.textTertiary}
                    autoFocus
                    editable={!isRenaming}
                    textAlign="right"
                    selectionColor={colors.textBrand}
                  />
                </FormField>
                <View className={`${rowStart} items-center gap-2.5 w-full`}>
                  <Button
                    label="حفظ الاسم"
                    variant="primary"
                    onPress={handleSaveName}
                    loading={isRenaming}
                    disabled={isRenaming}
                    testID="group-detail-name-save"
                    className="flex-1"
                  />
                  <Button
                    label="إلغاء"
                    variant="ghost"
                    onPress={handleCancelEditing}
                    disabled={isRenaming}
                    testID="group-detail-name-cancel"
                    className="flex-1"
                  />
                </View>
              </View>
            ) : null}

            {role === 'Admin' ? (
              <>
                <StaffReassignmentPanel
                  groupId={groupId}
                  currentTeacher={group.teacher}
                  currentAssistant={group.assistant}
                  onReassigned={(updatedGroup) => {
                    setGroup(updatedGroup);
                    setToastMessage('تم إعادة إسناد الطاقم');
                  }}
                />
                <ListRow
                  title="قائمة الطلاب"
                  leadingIcon="graduation"
                  onPress={handleOpenRoster}
                  testID="group-detail-roster-button"
                />
                <GroupLifecyclePanel
                  groupId={groupId}
                  lifecycleState={group.lifecycle_state}
                  groupName={group.name}
                  onChanged={(updatedGroup) => {
                    setGroup(updatedGroup);
                    setToastMessage(
                      updatedGroup.lifecycle_state === 'Archived'
                        ? 'تمت أرشفة المجموعة'
                        : 'تم إلغاء أرشفة المجموعة',
                    );
                  }}
                />
                <DeleteGroupPanel
                  groupId={groupId}
                  groupName={group.name}
                  onDeleted={() => {
                    if (router.canGoBack()) {
                      router.back();
                    } else {
                      router.replace('/(app)/admin');
                    }
                  }}
                />
              </>
            ) : null}

            {role === 'Teacher' ? (
              <EnrollmentToggle
                groupId={groupId}
                enrollmentStatus={group.enrollment_status}
                onToggled={(newStatus) => {
                  setGroup((prev) =>
                    prev ? { ...prev, enrollment_status: newStatus } : null,
                  );
                }}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {toastMessage ? (
        <View className="absolute left-4 right-4 bottom-6" pointerEvents="none">
          <Toast
            message={toastMessage}
            onDismiss={dismissToast}
            testID="group-detail-success-banner"
          />
        </View>
      ) : null}
    </View>
  );
}
