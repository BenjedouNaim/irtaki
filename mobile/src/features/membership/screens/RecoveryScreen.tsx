import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import {
  TopBar,
  Banner,
  StatusBadge,
  SkeletonLoader,
} from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { useThemeColors } from '@/shared/theme/colors';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import {
  getMembershipRecovery,
  MembershipRecoveryData,
  DailyReportRecoveryEntry,
  WeeklyReportRecoveryEntry,
  PaymentRecordRecoveryEntry,
} from '@/shared/api/memberships.client';
import { ApiError } from '@/shared/api/types';
import {
  formatArabicCount,
  formatArabicDate,
  REPORT_COUNT_FORMS,
  CYCLE_COUNT_FORMS,
} from '@/shared/utils/format';

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

/** Same wording as the SCR-10 reason picker (UF §33 consistency). */
function mapAbsenceReason(reason: string): string {
  switch (reason) {
    case 'Sick':
      return 'مريض';
    case 'Studying':
      return 'دراسة';
    case 'Other':
      return 'سبب آخر';
    default:
      return reason;
  }
}

function describeDailyReport(report: DailyReportRecoveryEntry): string {
  const type = mapReportType(report.type);
  if (report.type === 'Absent' && report.absence_reason) {
    return `${type} — ${mapAbsenceReason(report.absence_reason)}`;
  }
  return type;
}

function describeWeeklyReport(report: WeeklyReportRecoveryEntry): string {
  const attendance = report.attended_recitation_call ? 'حضر' : 'لم يحضر';
  return `فائت ${report.missed_daily_reports} · ${attendance}`;
}

interface RecoveryScreenProps {
  membershipId: string;
}

const CARD =
  'w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-[18px] py-4';

function SummaryRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: React.ReactNode;
  testID?: string;
}) {
  return (
    <View
      className={`${rowStart} items-center justify-between h-11 gap-3 w-full`}
      testID={testID}
    >
      <Text
        className={`flex-1 ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text
          selectable
          className={`${typography.bodyMdMedium} text-left text-fg dark:text-fg-dark`}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

function SectionHead({ title, count }: { title: string; count: string }) {
  return (
    <View className={`${rowStart} items-center justify-between w-full`}>
      <Text
        className={`${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {title}
      </Text>
      <Text
        className={`${typography.labelSm} text-left text-fg-tertiary dark:text-fg-tertiary-dark`}
      >
        {count}
      </Text>
    </View>
  );
}

function RecordRow({
  primary,
  secondary,
  testID,
}: {
  primary: string;
  secondary: string;
  testID: string;
}) {
  return (
    <View
      testID={testID}
      className={`${rowStart} items-center justify-between gap-3 py-2 w-full`}
    >
      <Text
        className={`${typography.bodyMd} text-right text-fg dark:text-fg-dark`}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {primary}
      </Text>
      <Text
        className={`flex-1 ${typography.bodySm} text-left text-fg-secondary dark:text-fg-secondary-dark`}
        numberOfLines={2}
      >
        {secondary}
      </Text>
    </View>
  );
}

function EmptyLine({ message, testID }: { message: string; testID: string }) {
  return (
    <View testID={testID} className="w-full py-2">
      <Text
        className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
      >
        {message}
      </Text>
    </View>
  );
}

/**
 * SCR-31 Recovery (Figma 41:429): the read-only view of a terminated
 * membership's soft-deleted records — an info banner, the membership
 * summary and the daily / weekly / payment record lists (API-028).
 */
export default function RecoveryScreen({ membershipId }: RecoveryScreenProps) {
  const colors = useThemeColors();
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

  const title = data?.membership.user.full_name || (data ? 'غير محدد' : '');

  let body: React.ReactElement;
  if (isLoading) {
    body = (
      <View className="px-4 pt-1">
        <SkeletonLoader variant="row" count={4} testID="recovery-skeleton" />
      </View>
    );
  } else if (errorMessage || !data) {
    body = (
      <View className="px-4 pt-1">
        <Banner
          tone="error"
          message={errorMessage || 'تعذر العثور على بيانات الاسترجاع'}
          onRetry={() => {
            setIsLoading(true);
            fetchRecovery();
          }}
          testID="recovery-error"
        />
      </View>
    );
  } else {
    const { membership, daily_reports, weekly_reports, payment_records } = data;
    body = (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.textBrand}
          />
        }
        contentInsetAdjustmentBehavior="automatic"
      >
        <Banner
          tone="info"
          message="سجلات محذوفة منطقيًا — عرض للقراءة فقط، لا استعادة للعضوية."
          testID="recovery-info-banner"
        />

        {/* 1. Membership summary */}
        <View
          className={`${CARD} gap-1.5 ${itemsStart}`}
          style={{ borderCurve: 'continuous' }}
          testID="membership-info-card"
        >
          <Text
            className={`w-full ${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            العضوية
          </Text>
          <SummaryRow label="المجموعة" value={membership.group.name} />
          <SummaryRow
            label="من"
            value={formatArabicDate(membership.started_at)}
          />
          <SummaryRow
            label="إلى"
            value={
              membership.ended_at ? formatArabicDate(membership.ended_at) : '—'
            }
          />
          <SummaryRow
            label="الحالة"
            value={
              <StatusBadge
                status={membership.state === 'Active' ? 'نشطة' : 'منتهية'}
                variant={membership.state === 'Active' ? 'success' : 'neutral'}
                testID="membership-state-badge"
              />
            }
          />
        </View>

        {/* 2. Daily reports */}
        <View
          className={`${CARD} gap-2 ${itemsStart}`}
          style={{ borderCurve: 'continuous' }}
          testID="daily-reports-card"
        >
          <SectionHead
            title="التقارير اليومية"
            count={formatArabicCount(daily_reports.length, REPORT_COUNT_FORMS)}
          />
          {daily_reports.length === 0 ? (
            <EmptyLine
              message="لا توجد تقارير يومية محذوفة"
              testID="daily-reports-empty"
            />
          ) : (
            daily_reports.map((report) => (
              <RecordRow
                key={report.id}
                testID={`daily-report-row-${report.id}`}
                primary={formatArabicDate(report.report_date, { year: false })}
                secondary={describeDailyReport(report)}
              />
            ))
          )}
        </View>

        {/* 3. Weekly reports */}
        <View
          className={`${CARD} gap-2 ${itemsStart}`}
          style={{ borderCurve: 'continuous' }}
          testID="weekly-reports-card"
        >
          <SectionHead
            title="التقارير الأسبوعية"
            count={formatArabicCount(weekly_reports.length, REPORT_COUNT_FORMS)}
          />
          {weekly_reports.length === 0 ? (
            <EmptyLine
              message="لا توجد تقارير أسبوعية محذوفة"
              testID="weekly-reports-empty"
            />
          ) : (
            weekly_reports.map((report) => (
              <RecordRow
                key={report.id}
                testID={`weekly-report-row-${report.id}`}
                primary={`أسبوع ${formatArabicDate(report.week_start, {
                  year: false,
                })} — ${formatArabicDate(report.week_end, { year: false })}`}
                secondary={describeWeeklyReport(report)}
              />
            ))
          )}
        </View>

        {/* 4. Payment records */}
        <View
          className={`${CARD} gap-2 ${itemsStart}`}
          style={{ borderCurve: 'continuous' }}
          testID="payment-records-card"
        >
          <SectionHead
            title="المدفوعات"
            count={formatArabicCount(payment_records.length, CYCLE_COUNT_FORMS)}
          />
          {payment_records.length === 0 ? (
            <EmptyLine
              message="لا توجد سجلات دفع محذوفة"
              testID="payment-records-empty"
            />
          ) : (
            payment_records.map((payment: PaymentRecordRecoveryEntry) => (
              <RecordRow
                key={payment.id}
                testID={`payment-record-row-${payment.id}`}
                primary={`الدورة ${payment.cycle_index + 1}`}
                secondary={`${payment.amount} د.ت · ${
                  payment.paid_at
                    ? `مدفوع في ${formatArabicDate(payment.paid_at, { year: false })}`
                    : 'غير مدفوع'
                }`}
              />
            ))
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="recovery-screen"
    >
      <TopBar title={title} testID="recovery-top-bar" />
      {body}
    </View>
  );
}
