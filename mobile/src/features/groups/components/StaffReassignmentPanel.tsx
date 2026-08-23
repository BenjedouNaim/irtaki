import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button } from '@/shared/components/Button';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import {
  reassignStaff,
  GroupListItemFull,
  GroupStaff,
} from '@/shared/api/groups.client';
import { listUsersByRole, UserListItem } from '@/shared/api/users.client';
import { ApiError } from '@/shared/api/types';

export interface StaffReassignmentPanelProps {
  groupId: string;
  currentTeacher: GroupStaff;
  currentAssistant: GroupStaff;
  onReassigned?: (updatedGroup: GroupListItemFull) => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

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

  // Selected staff state
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

  const handleTeacherSelect = (id: string) => {
    triggerHaptic();
    setSelectedTeacherId(id);
    if (errorMessage) setErrorMessage(null);
  };

  const handleAssistantSelect = (id: string) => {
    triggerHaptic();
    setSelectedAssistantId(id);
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

      onReassigned?.(response.data as GroupListItemFull);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 422 && err.details && err.details.length > 0) {
          setErrorMessage(err.details[0].message);
        } else {
          setErrorMessage(err.message || 'حدث خطأ أثناء إعادة تعيين الكادر');
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
      className={`p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 gap-4 ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="gap-1">
        <Text className="text-base font-bold text-gray-900 dark:text-gray-100 text-right">
          إعادة تعيين الكادر المشرف
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
          قم باختيار المعلم أو المساعد الجديد لتعديل الإشراف على الحلقة
        </Text>
      </View>

      {/* Loading State */}
      {isLoadingStaff ? (
        <View testID="staff-reassign-loading" className="gap-3">
          <SkeletonLoader count={2} variant="row" />
        </View>
      ) : fetchError ? (
        /* Error Fetching Staff */
        <View
          className="p-3 rounded-lg bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 gap-2"
          style={{ borderCurve: 'continuous' }}
          testID="staff-reassign-fetch-error"
        >
          <Text
            selectable
            className="text-xs text-destructive-700 dark:text-destructive-300 text-right font-medium"
          >
            {fetchError}
          </Text>
          <Button
            label="إعادة المحاولة"
            variant="outline"
            onPress={fetchStaff}
            testID="staff-reassign-retry-button"
          />
        </View>
      ) : (
        <View className="gap-4">
          {/* Submission Error Banner */}
          {errorMessage ? (
            <View
              className="p-3 rounded-lg bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800"
              style={{ borderCurve: 'continuous' }}
              testID="reassign-staff-error"
            >
              <Text
                selectable
                className="text-xs text-destructive-700 dark:text-destructive-300 text-right font-medium"
              >
                {errorMessage}
              </Text>
            </View>
          ) : null}

          {/* Teacher Selection */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-gray-800 dark:text-gray-200 text-right">
              المعلم المشرف
            </Text>
            {teachers.length === 0 ? (
              <Text className="text-xs text-gray-500 dark:text-gray-400 text-right py-1">
                لا يوجد معلمون مسجلون حالياً
              </Text>
            ) : (
              <View className="gap-2">
                {teachers.map((teacher) => {
                  const isSelected = selectedTeacherId === teacher.id;
                  const isCurrent = currentTeacher.id === teacher.id;
                  return (
                    <Pressable
                      key={teacher.id}
                      testID={`reassign-teacher-option-${teacher.id}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${teacher.full_name || teacher.email}${
                        isCurrent ? ' (الحالي)' : ''
                      }`}
                      onPress={() => handleTeacherSelect(teacher.id)}
                      disabled={isSubmitting}
                      className={`p-3 rounded-xl border flex-row-reverse items-center justify-between ${
                        isSelected
                          ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                          : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900'
                      }`}
                      style={{ borderCurve: 'continuous' }}
                    >
                      <View className="flex-row-reverse items-center gap-2">
                        <Text
                          className={`text-sm font-semibold text-right ${
                            isSelected
                              ? 'text-primary dark:text-primary-400'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          {teacher.full_name || teacher.email}
                        </Text>
                        {isCurrent ? (
                          <Text className="text-xs text-gray-500 dark:text-gray-400">
                            (الحالي)
                          </Text>
                        ) : null}
                      </View>
                      {isSelected ? (
                        <View className="w-2.5 h-2.5 rounded-full bg-primary" />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Assistant Selection */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-gray-800 dark:text-gray-200 text-right">
              المساعد الإداري
            </Text>
            {assistants.length === 0 ? (
              <Text className="text-xs text-gray-500 dark:text-gray-400 text-right py-1">
                لا يوجد مساعدون إداريون مسجلون حالياً
              </Text>
            ) : (
              <View className="gap-2">
                {assistants.map((assistant) => {
                  const isSelected = selectedAssistantId === assistant.id;
                  const isCurrent = currentAssistant.id === assistant.id;
                  return (
                    <Pressable
                      key={assistant.id}
                      testID={`reassign-assistant-option-${assistant.id}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${assistant.full_name || assistant.email}${
                        isCurrent ? ' (الحالي)' : ''
                      }`}
                      onPress={() => handleAssistantSelect(assistant.id)}
                      disabled={isSubmitting}
                      className={`p-3 rounded-xl border flex-row-reverse items-center justify-between ${
                        isSelected
                          ? 'border-primary bg-primary-50/40 dark:bg-primary-950/40'
                          : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900'
                      }`}
                      style={{ borderCurve: 'continuous' }}
                    >
                      <View className="flex-row-reverse items-center gap-2">
                        <Text
                          className={`text-sm font-semibold text-right ${
                            isSelected
                              ? 'text-primary dark:text-primary-400'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          {assistant.full_name || assistant.email}
                        </Text>
                        {isCurrent ? (
                          <Text className="text-xs text-gray-500 dark:text-gray-400">
                            (الحالي)
                          </Text>
                        ) : null}
                      </View>
                      {isSelected ? (
                        <View className="w-2.5 h-2.5 rounded-full bg-primary" />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Submit Button */}
          <Button
            label="حفظ تعيين الكادر"
            variant="primary"
            onPress={handleSave}
            loading={isSubmitting}
            disabled={!isChanged || isSubmitting}
            testID="reassign-staff-save-button"
          />
        </View>
      )}
    </View>
  );
}
