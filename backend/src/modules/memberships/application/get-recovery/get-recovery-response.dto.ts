export interface MembershipRecoveryUserDto {
  id: string;
  full_name: string | null;
  gender: string | null;
}

export interface MembershipRecoveryGroupDto {
  id: string;
  name: string;
  recitation_day: number;
  enrollment_status: string;
}

export interface MembershipRecoveryMembershipDto {
  id: string;
  user: MembershipRecoveryUserDto;
  group: MembershipRecoveryGroupDto;
  state: 'Active' | 'Terminated';
  started_at: string;
  ended_at: string | null;
  ended_by: string | null;
}

export interface DailyReportRecoveryEntryDto {
  id: string;
  membership_id: string;
  report_date: string;
  type: string;
  submitted_at: string;
  submitted_timezone: string;
  no_memorization_today: boolean | null;
  memo_from_ordinal: number | null;
  memo_to_ordinal: number | null;
  memo_time_from: string | null;
  memo_time_to: string | null;
  completed_50_repetitions: boolean | null;
  repetitions_in_single_session: boolean | null;
  no_revision_today: boolean | null;
  rev_from_ordinal: number | null;
  rev_to_ordinal: number | null;
  rev_time_from: string | null;
  rev_time_to: string | null;
  read_tafsir: boolean | null;
  absence_reason: string | null;
  deleted_at: string;
}

export interface WeeklyReportRecoveryEntryDto {
  id: string;
  membership_id: string;
  week_start: string;
  week_end: string;
  expected_days: number;
  missed_daily_reports: number;
  missed_daily_memorization: number;
  missed_daily_revision: number;
  missed_50_repetitions: number;
  missed_single_session: number;
  attended_recitation_call: boolean;
  state: string;
  finalised_at: string | null;
  finalised_by: string | null;
  deleted_at: string;
}

export interface PaymentRecordRecoveryEntryDto {
  id: string;
  membership_id: string;
  cycle_index: number;
  amount: string;
  paid_at: string;
  recorded_by: string;
  deleted_at: string;
}

export interface MembershipRecoveryDataDto {
  membership: MembershipRecoveryMembershipDto;
  daily_reports: DailyReportRecoveryEntryDto[];
  weekly_reports: WeeklyReportRecoveryEntryDto[];
  payment_records: PaymentRecordRecoveryEntryDto[];
}

export interface GetMembershipRecoveryResponseDto {
  data: MembershipRecoveryDataDto;
}
