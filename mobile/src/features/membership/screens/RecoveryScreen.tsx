import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Button } from '@/shared/components/Button';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import {
  getMembershipRecovery,
  MembershipRecoveryData,
  DailyReportRecoveryEntry,
  WeeklyReportRecoveryEntry,
  PaymentRecordRecoveryEntry,
} from '@/shared/api/memberships.client';
import { ApiError } from '@/shared/api/types';

export function getRecitationDayName(day: number): string {
  switch (day) {
    case 1:
      return 'الاثنين';
    case 2:
      return 'الثلاثاء';
    case 3:
      return 'الأربعاء';
    case 4:
      return 'الخميس';
    case 5:
      return 'الجمعة';
    case 6:
      return 'السبت';
    case 7:
      return 'الأحد';
    default:
      return `يوم ${day}`;
  }
}

function mapReportType(type: string): string {
  switch (type) {
    case 'Normal':
      return 'عادي';
    case 'Absent':
      return 'غياب';
    case 'Revision':
      return 'مراجعة فقط';
    default:
      return type;
  }
}

interface RecoveryScreenProps {
  membershipId: string;
}

export default function RecoveryScreen({ membershipId }: RecoveryScreenProps) {
  const [data, setData] = useState<MembershipRecoveryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchRecovery = useCallback(async () => {
    if (!membershipId) {
      setErrorMessage('معرف العضوية غير صالح');
      setIsLoading(false);
      return;
    }

    setErrorMessage(null);
    try {
      const response = await getMembershipRecovery(membershipId);
      setData(response.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل بيانات الاسترجاع');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [membershipId]);

  useEffect(() => {
    setIsLoading(true);
    fetchRecovery();
  }, [fetchRecovery]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchRecovery();
  }, [fetchRecovery]);

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-gray-50 dark:bg-gray-950 p-4"
        testID="recovery-screen"
      >
        <SkeletonLoader variant="row" count={4} testID="recovery-skeleton" />
      </View>
    );
  }

  if (errorMessage || !data) {
    return (
      <View
        className="flex-1 bg-gray-50 dark:bg-gray-950 p-4"
        testID="recovery-screen"
      >
        <View
          className="p-4 rounded-xl bg-destructive-50 border border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800 gap-3"
          style={{ borderCurve: 'continuous' }}
          testID="recovery-error"
        >
          <Text
            selectable
            className="text-sm font-medium text-destructive-700 dark:text-destructive-300 text-right leading-5"
          >
            {errorMessage || 'تعذر العثور على بيانات الاسترجاع'}
          </Text>
          <Button
            label="إعادة المحاولة"
            variant="outline"
            onPress={() => {
              setIsLoading(true);
              fetchRecovery();
            }}
            testID="retry-button"
          />
        </View>
      </View>
    );
  }

  const { membership, daily_reports, weekly_reports, payment_records } = data;

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-950"
      contentContainerStyle={{ padding: 16, gap: 16 }}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
      testID="recovery-screen"
    >
      {/* 1. Membership Details Card */}
      <View
        className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 gap-3"
        style={{ borderCurve: 'continuous' }}
        testID="membership-info-card"
      >
        <View className="flex-row-reverse justify-between items-center pb-2 border-b border-gray-100 dark:border-gray-800">
          <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right">
            بيانات العضوية
          </Text>
          <StatusBadge
            status={membership.state === 'Active' ? 'نشطة' : 'محذوفة'}
            variant={membership.state === 'Active' ? 'info' : 'error'}
            testID="membership-state-badge"
          />
        </View>

        <View className="flex-row-reverse justify-between items-center py-1.5 border-b border-gray-50 dark:border-gray-800/50">
          <Text className="text-sm font-medium text-gray-500 dark:text-gray-400 text-right">
            اسم الطالب
          </Text>
          <Text
            selectable
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right"
          >
            {membership.user.full_name || 'غير محدد'}
          </Text>
        </View>

        <View className="flex-row-reverse justify-between items-center py-1.5 border-b border-gray-50 dark:border-gray-800/50">
          <Text className="text-sm font-medium text-gray-500 dark:text-gray-400 text-right">
            الجنس
          </Text>
          <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
            {membership.user.gender === 'Male'
              ? 'ذكر'
              : membership.user.gender === 'Female'
                ? 'أنثى'
                : 'غير محدد'}
          </Text>
        </View>

        <View className="flex-row-reverse justify-between items-center py-1.5 border-b border-gray-50 dark:border-gray-800/50">
          <Text className="text-sm font-medium text-gray-500 dark:text-gray-400 text-right">
            الحلقة
          </Text>
          <Text
            selectable
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right"
          >
            {membership.group.name}
          </Text>
        </View>

        <View className="flex-row-reverse justify-between items-center py-1.5 border-b border-gray-50 dark:border-gray-800/50">
          <Text className="text-sm font-medium text-gray-500 dark:text-gray-400 text-right">
            يوم التسميع
          </Text>
          <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
            {getRecitationDayName(membership.group.recitation_day)}
          </Text>
        </View>

        <View className="flex-row-reverse justify-between items-center py-1.5 border-b border-gray-50 dark:border-gray-800/50">
          <Text className="text-sm font-medium text-gray-500 dark:text-gray-400 text-right">
            تاريخ البدء
          </Text>
          <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
            {membership.started_at}
          </Text>
        </View>

        {membership.ended_at && (
          <View className="flex-row-reverse justify-between items-center py-1.5">
            <Text className="text-sm font-medium text-gray-500 dark:text-gray-400 text-right">
              تاريخ الإنهاء
            </Text>
            <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
              {membership.ended_at}
            </Text>
          </View>
        )}
      </View>

      {/* 2. Daily Reports Card */}
      <View
        className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 gap-3"
        style={{ borderCurve: 'continuous' }}
        testID="daily-reports-card"
      >
        <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right pb-2 border-b border-gray-100 dark:border-gray-800">
          التقارير اليومية المحذوفة ({daily_reports.length})
        </Text>
        {daily_reports.length === 0 ? (
          <View testID="daily-reports-empty" className="py-4 items-center">
            <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
              لا توجد تقارير يومية محذوفة
            </Text>
          </View>
        ) : (
          <View className="gap-2.5">
            {daily_reports.map((report: DailyReportRecoveryEntry) => (
              <View
                key={report.id}
                testID={`daily-report-row-${report.id}`}
                className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 gap-2"
                style={{ borderCurve: 'continuous' }}
              >
                <View className="flex-row-reverse justify-between items-center">
                  <Text className="text-sm font-bold text-gray-900 dark:text-gray-100 text-right">
                    {report.report_date}
                  </Text>
                  <StatusBadge
                    status={mapReportType(report.type)}
                    variant={
                      report.type === 'Normal'
                        ? 'success'
                        : report.type === 'Revision'
                          ? 'info'
                          : 'warning'
                    }
                  />
                </View>
                {report.absence_reason && (
                  <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
                    سبب الغياب: {report.absence_reason}
                  </Text>
                )}
                {report.deleted_at && (
                  <Text className="text-xs text-gray-400 dark:text-gray-500 text-right">
                    تاريخ الحذف: {report.deleted_at.split('T')[0]}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 3. Weekly Reports Card */}
      <View
        className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 gap-3"
        style={{ borderCurve: 'continuous' }}
        testID="weekly-reports-card"
      >
        <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right pb-2 border-b border-gray-100 dark:border-gray-800">
          التقارير الأسبوعية المحذوفة ({weekly_reports.length})
        </Text>
        {weekly_reports.length === 0 ? (
          <View testID="weekly-reports-empty" className="py-4 items-center">
            <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
              لا توجد تقارير أسبوعية محذوفة
            </Text>
          </View>
        ) : (
          <View className="gap-2.5">
            {weekly_reports.map((report: WeeklyReportRecoveryEntry) => (
              <View
                key={report.id}
                testID={`weekly-report-row-${report.id}`}
                className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 gap-2"
                style={{ borderCurve: 'continuous' }}
              >
                <View className="flex-row-reverse justify-between items-center">
                  <Text className="text-sm font-bold text-gray-900 dark:text-gray-100 text-right">
                    {report.week_start} إلى {report.week_end}
                  </Text>
                  <StatusBadge
                    status={report.state === 'Finalised' ? 'مؤكد' : 'مفتوح'}
                    variant={
                      report.state === 'Finalised' ? 'success' : 'neutral'
                    }
                  />
                </View>
                <View className="flex-row-reverse justify-between">
                  <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
                    حضور التسميع:{' '}
                    {report.attended_recitation_call ? 'نعم' : 'لا'}
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
                    الأيام المتوقعة: {report.expected_days}
                  </Text>
                </View>
                {report.deleted_at && (
                  <Text className="text-xs text-gray-400 dark:text-gray-500 text-right">
                    تاريخ الحذف: {report.deleted_at.split('T')[0]}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 4. Payment Records Card */}
      <View
        className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 gap-3"
        style={{ borderCurve: 'continuous' }}
        testID="payment-records-card"
      >
        <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right pb-2 border-b border-gray-100 dark:border-gray-800">
          سجلات الدفع المحذوفة ({payment_records.length})
        </Text>
        {payment_records.length === 0 ? (
          <View testID="payment-records-empty" className="py-4 items-center">
            <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
              لا توجد سجلات دفع محذوفة
            </Text>
          </View>
        ) : (
          <View className="gap-2.5">
            {payment_records.map((payment: PaymentRecordRecoveryEntry) => (
              <View
                key={payment.id}
                testID={`payment-record-row-${payment.id}`}
                className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 gap-2"
                style={{ borderCurve: 'continuous' }}
              >
                <View className="flex-row-reverse justify-between items-center">
                  <Text className="text-sm font-bold text-gray-900 dark:text-gray-100 text-right">
                    الدورة {payment.cycle_index + 1}
                  </Text>
                  <Text className="text-sm font-bold text-primary-600 dark:text-primary-400 text-right">
                    {payment.amount} د.ت
                  </Text>
                </View>
                <View className="flex-row-reverse justify-between">
                  <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
                    تاريخ الدفع:{' '}
                    {payment.paid_at ? payment.paid_at.split('T')[0] : '—'}
                  </Text>
                  {payment.deleted_at && (
                    <Text className="text-xs text-gray-400 dark:text-gray-500 text-right">
                      تاريخ الحذف: {payment.deleted_at.split('T')[0]}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
