import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { Button } from '@/shared/components/Button';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import {
  getGroupDetail,
  updateGroupName,
  GroupListItemFull,
} from '@/shared/api/groups.client';
import { useAuthStore } from '@/shared/auth/authStore';
import { ApiError } from '@/shared/api/types';
import { StaffReassignmentPanel } from '../components/StaffReassignmentPanel';
import { EnrollmentToggle } from '../components/EnrollmentToggle';
import { getRecitationDayName } from './JoinStepperScreen';

export interface GroupDetailScreenProps {
  groupId: string;
}

export function GroupDetailScreen({ groupId }: GroupDetailScreenProps) {
  const role = useAuthStore((s) => s.role);
  const [group, setGroup] = useState<GroupListItemFull | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inline rename state
  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const fetchDetail = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await getGroupDetail(groupId);
      setGroup(response.data as GroupListItemFull);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل تفاصيل الحلقة');
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

  const handleStartEditing = () => {
    if (!group) return;
    setNameDraft(group.name);
    setRenameError(null);
    setSubmitSuccess(false);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setRenameError(null);
    setNameDraft(group?.name || '');
  };

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setRenameError('اسم الحلقة مطلوب');
      return;
    }

    setIsRenaming(true);
    setRenameError(null);
    setSubmitSuccess(false);

    try {
      const response = await updateGroupName(groupId, { name: trimmed });
      setGroup(response.data as GroupListItemFull);
      setIsEditing(false);
      setSubmitSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 409) {
          setRenameError('اسم الحلقة مستخدم بالفعل');
        } else if (err.statusCode === 422) {
          if (err.details && err.details.length > 0) {
            setRenameError(err.details[0].message);
          } else {
            setRenameError(err.message || 'اسم الحلقة غير صالح');
          }
        } else {
          setRenameError(err.message || 'حدث خطأ أثناء تحديث اسم الحلقة');
        }
      } else {
        setRenameError('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-950"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="group-detail-screen"
    >
      {isLoading ? (
        <View testID="group-detail-skeleton" className="gap-4">
          <SkeletonLoader variant="dashboard" />
          <SkeletonLoader count={3} variant="row" />
        </View>
      ) : errorMessage ? (
        <View
          className="p-4 rounded-xl bg-destructive-50 border border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800 gap-3"
          style={{ borderCurve: 'continuous' }}
          testID="group-detail-error"
        >
          <Text
            selectable
            className="text-sm font-medium text-destructive-700 dark:text-destructive-300 text-right leading-5"
          >
            {errorMessage}
          </Text>
          <Button
            label="إعادة المحاولة"
            variant="outline"
            onPress={fetchDetail}
            testID="retry-button"
          />
        </View>
      ) : group ? (
        <View className="gap-4">
          {submitSuccess ? (
            <View
              className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4"
              style={{ borderCurve: 'continuous' }}
              testID="group-detail-success-banner"
            >
              <Text
                selectable
                className="text-emerald-800 dark:text-emerald-200 text-sm font-semibold text-center"
              >
                تم تحديث اسم الحلقة بنجاح
              </Text>
            </View>
          ) : null}

          {/* Header Card */}
          <View
            className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 gap-3"
            style={{ borderCurve: 'continuous' }}
          >
            {isEditing ? (
              <View className="gap-3" testID="group-detail-edit-container">
                <Text className="text-sm font-bold text-gray-700 dark:text-gray-200 text-right">
                  تعديل اسم الحلقة
                </Text>
                <TextInput
                  testID="group-detail-name-input"
                  className={`w-full h-12 border rounded-lg px-3.5 text-base text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 text-right ${
                    renameError
                      ? 'border-destructive bg-white dark:bg-gray-950'
                      : 'border-gray-300 dark:border-gray-700'
                  }`}
                  style={{ borderCurve: 'continuous' }}
                  value={nameDraft}
                  onChangeText={(text) => {
                    setNameDraft(text);
                    if (renameError) setRenameError(null);
                  }}
                  placeholder="اسم الحلقة"
                  placeholderTextColor="#9ca3af"
                  autoFocus
                  editable={!isRenaming}
                  textAlign="right"
                />
                {renameError ? (
                  <Text
                    selectable
                    className="text-xs text-destructive text-right font-medium"
                    testID="group-detail-name-error"
                  >
                    {renameError}
                  </Text>
                ) : null}
                <View className="flex-row-reverse items-center gap-2 pt-1">
                  <Button
                    label="حفظ"
                    variant="primary"
                    onPress={handleSaveName}
                    loading={isRenaming}
                    disabled={isRenaming}
                    testID="group-detail-name-save"
                    className="flex-1"
                  />
                  <Button
                    label="إلغاء"
                    variant="secondary"
                    onPress={handleCancelEditing}
                    disabled={isRenaming}
                    testID="group-detail-name-cancel"
                    className="flex-1"
                  />
                </View>
              </View>
            ) : (
              <View className="flex-row-reverse items-center justify-between gap-3">
                <Text
                  selectable
                  className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right flex-1"
                  testID="group-detail-name"
                >
                  {group.name}
                </Text>
                <Pressable
                  onPress={handleStartEditing}
                  accessibilityRole="button"
                  accessibilityLabel="تعديل اسم الحلقة"
                  testID="group-detail-name-edit-button"
                  className="p-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 items-center justify-center min-w-[40px] min-h-[40px]"
                  style={{ borderCurve: 'continuous' }}
                >
                  <Text className="text-base text-gray-700 dark:text-gray-300">
                    ✏️
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Badges Row */}
            <View className="flex-row-reverse items-center gap-2 flex-wrap pt-1">
              <StatusBadge
                status={
                  group.enrollment_status === 'Open'
                    ? 'مفتوح للتسجيل'
                    : 'مغلق للتسجيل'
                }
                variant={
                  group.enrollment_status === 'Open' ? 'success' : 'neutral'
                }
                testID="group-detail-enrollment-badge"
              />
              <StatusBadge
                status={group.lifecycle_state === 'Active' ? 'نشطة' : 'مؤرشفة'}
                variant={
                  group.lifecycle_state === 'Active' ? 'info' : 'warning'
                }
                testID="group-detail-lifecycle-badge"
              />
            </View>
          </View>

          {/* Group Details Card */}
          <View
            className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 gap-4"
            style={{ borderCurve: 'continuous' }}
          >
            <Text className="text-base font-bold text-gray-900 dark:text-gray-100 text-right mb-1">
              معلومات الحلقة
            </Text>

            {/* Recitation Day */}
            <View className="flex-row-reverse items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                يوم التسميع
              </Text>
              <Text
                selectable
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                testID="group-detail-recitation-day"
              >
                {getRecitationDayName(group.recitation_day)}
              </Text>
            </View>

            {/* Target Gender */}
            <View className="flex-row-reverse items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                الفئة المستهدفة
              </Text>
              <Text
                selectable
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                testID="group-detail-gender"
              >
                {group.gender === 'Male' ? 'ذكور (بنين)' : 'إناث (بنات)'}
              </Text>
            </View>

            {/* Teacher */}
            <View className="flex-row-reverse items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                المعلم المشرف
              </Text>
              <Text
                selectable
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                testID="group-detail-teacher"
              >
                {group.teacher?.full_name || 'غير محدد'}
              </Text>
            </View>

            {/* Assistant */}
            <View className="flex-row-reverse items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                المساعد الإداري
              </Text>
              <Text
                selectable
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                testID="group-detail-assistant"
              >
                {group.assistant?.full_name || 'غير محدد'}
              </Text>
            </View>

            {/* Riwaya */}
            <View className="flex-row-reverse items-center justify-between py-2">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                الرواية
              </Text>
              <Text
                selectable
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                testID="group-detail-riwaya"
              >
                قالون عن نافع
              </Text>
            </View>
          </View>

          {/* Admin Staff Reassignment Panel */}
          {role === 'Admin' ? (
            <StaffReassignmentPanel
              groupId={groupId}
              currentTeacher={group.teacher}
              currentAssistant={group.assistant}
              onReassigned={(updatedGroup) => {
                setGroup(updatedGroup);
                setSubmitSuccess(true);
              }}
            />
          ) : null}

          {/* Teacher Enrollment Toggle Panel */}
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
        </View>
      ) : null}
    </ScrollView>
  );
}
