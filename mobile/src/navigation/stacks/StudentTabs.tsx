import React, { useContext, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { TabBar, TabBarItem } from '@/shared/components/TabBar';
import { TopBar } from '@/shared/components/TopBar';
import { HomeHeader } from '@/features/dashboard/components/HomeHeader';
import { WeekCard } from '@/features/dashboard/components/WeekCard';
import { ReportStatusCard } from '@/features/dailyReports/components/ReportStatusCard';
import { ProgressSection } from '@/features/progress/components/ProgressSection';
import { PaymentScreen } from '@/features/payments/screens/PaymentScreen';
import { PerformanceSection } from '@/features/performance/components/PerformanceSection';
import { logoutUser } from '@/shared/api/auth.client';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';

export type StudentTab = 'home' | 'progress' | 'payment';

/** Figma TabBar.Role=Student (10:151): Home · Progress · Payment. */
const STUDENT_TAB_ITEMS: TabBarItem[] = [
  { key: 'home', label: 'الرئيسية', icon: 'home' },
  { key: 'progress', label: 'التقدّم', icon: 'chart' },
  { key: 'payment', label: 'الدفع', icon: 'wallet' },
];

/** Figma's 84px bar includes the home indicator; on device the safe-area inset replaces it. */
const DEFAULT_BOTTOM_INSET = 22;

/**
 * SCR-08 Student Home + SCR-13 Progress + SCR-16 Payment under one TabBar
 * (UF §8 "Student: Home · Progress · Payment"). Home (Figma 24:2 / 24:145 /
 * 24:250): the greeting header, the DailyCTA hero (F-DR-01) and the "هذا
 * الأسبوع" card (F-WR-01). Progress (Figma 30:553): the
 * memorization-progress card (F-PRG-02) and the "سجلّ التقارير" link to
 * SCR-14 — the period selector, commitment score, day breakdown,
 * quality/attendance tiles and days-since need the unbuilt performance
 * endpoint and are not rendered. Payment (Figma 30:701): the derived cycle
 * ledger (F-PAY-01), which brings its own TopBar and scroll view.
 */
export function StudentTabs() {
  const router = useRouter();
  const insets = useContext(SafeAreaInsetsContext);
  const [tab, setTab] = useState<StudentTab>('home');
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

  const openHistory = () => router.push('/(app)/student/reports/history');

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="student-tabs"
    >
      {tab === 'home' ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 24,
            gap: 16,
          }}
          contentInsetAdjustmentBehavior="automatic"
          testID="student-home"
        >
          <HomeHeader onOpenProfile={() => router.push('/(app)/profile')} />

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
          />

          {/* UF §10 "This-week live card" — read-only strip from API-033. */}
          <WeekCard />

          {/* Session exit (UF §9 Logout: no confirmation, instantly reversible). */}
          <Button
            label="تسجيل الخروج"
            variant="ghost"
            loading={isLoggingOut}
            onPress={handleLogout}
            testID="logout-button"
            className="w-full"
            textClassName="text-fg-error"
          />
        </ScrollView>
      ) : tab === 'payment' ? (
        <PaymentScreen />
      ) : (
        <View className="flex-1" testID="student-progress">
          <TopBar title="التقدّم" back={false} testID="progress-top-bar" />
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 4,
              paddingBottom: 24,
              gap: 16,
            }}
            contentInsetAdjustmentBehavior="automatic"
          >
            {/* F-PERF-01 wraps F-PRG-02's card so SCR-13 keeps Figma's
                order: selector · score · memorization · breakdown · tiles ·
                days-since. */}
            <PerformanceSection>
              <ProgressSection />
            </PerformanceSection>

            {/* Progress tab → History (UF §26); SCR-14 (F-DR-05). */}
            <Pressable
              testID="report-history-button"
              onPress={openHistory}
              accessibilityRole="button"
              accessibilityLabel="سجلّ التقارير"
              className={`w-full ${rowStart} items-center justify-between gap-3 px-5 py-4 min-h-[56px] rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark active:opacity-80`}
              style={{ borderCurve: 'continuous' }}
            >
              <View className={`${rowStart} items-center gap-2.5`}>
                <Icon name="history" size={20} tone="brand" />
                <Text
                  className={`${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
                >
                  سجلّ التقارير
                </Text>
              </View>
              <Icon name="chevron-left" size={20} tone="tertiary" />
            </Pressable>
          </ScrollView>
        </View>
      )}

      <TabBar
        items={STUDENT_TAB_ITEMS}
        activeKey={tab}
        onSelect={(key) => {
          if (key === 'home' || key === 'progress' || key === 'payment') {
            setTab(key);
          }
        }}
        bottomInset={insets?.bottom ?? DEFAULT_BOTTOM_INSET}
        testID="student-tab-bar"
      />
    </View>
  );
}
