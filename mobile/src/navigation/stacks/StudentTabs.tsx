import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Button } from '@/shared/components/Button';
import { ReportStatusCard } from '@/features/dailyReports/components/ReportStatusCard';
import { logoutUser } from '@/shared/api/auth.client';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';

import { useRouter } from 'expo-router';

export function StudentTabs() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const refreshToken = await getStoredRefreshToken();
      if (refreshToken) {
        await logoutUser(refreshToken);
      }
    } catch {
      // Best effort logout on API failure
    } finally {
      await deleteStoredRefreshToken();
      useAuthStore.getState().clearSession();
      setIsLoggingOut(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-gray-950"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
      }}
      contentInsetAdjustmentBehavior="automatic"
      testID="student-tabs"
    >
      <View className="w-full max-w-md items-center">
        <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
          شاشة الطالب (الرئيسية · التقدم · الاشتراكات)
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Student Tabs Stub
        </Text>

        {/* SCR-08 Daily Report CTA (F-DR-01). Home → Type Selection (UF §26);
            already_submitted → today's report, read-only (SCR-15, F-DR-07);
            recitation_day → Weekly Report (SCR-12, F-WR-01). */}
        <ReportStatusCard
          onSubmitReport={() =>
            router.push('/(app)/student/daily-report/type-selection')
          }
          onViewReport={(report) =>
            router.push({
              pathname: '/(app)/student/reports/[id]',
              params: { id: report.id },
            })
          }
          onCompleteWeeklyReport={() =>
            router.push('/(app)/student/weekly-report')
          }
          className="mb-6"
        />

        {/* Progress tab → History (UF §26); SCR-14 (F-DR-05). */}
        <Button
          label="سجل التقارير"
          variant="secondary"
          onPress={() => router.push('/(app)/student/reports/history')}
          testID="report-history-button"
          className="mb-3 w-full"
        />
        <Button
          label="الملف الشخصي"
          variant="outline"
          onPress={() => router.push('/(app)/profile')}
          testID="profile-button"
          className="mb-3 w-full"
        />
        <Button
          label="تسجيل الخروج"
          variant="destructive"
          loading={isLoggingOut}
          onPress={handleLogout}
          testID="logout-button"
          className="w-full"
        />
      </View>
    </ScrollView>
  );
}
