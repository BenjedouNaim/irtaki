import { WeeklyReportRecord } from '../domain/weekly-report.repository.interface';
import { toWeeklyReportDto } from './weekly-report.mapper';

describe('toWeeklyReportDto (WeeklyReportDto, TS §13)', () => {
  const open: WeeklyReportRecord = {
    id: 'weekly-1',
    membershipId: 'membership-1',
    weekStart: '2026-08-29',
    weekEnd: '2026-09-04',
    expectedDays: 6,
    missedDailyReports: 1,
    missedDailyMemorization: 2,
    missedDailyRevision: 3,
    missed50Repetitions: 4,
    missedSingleSession: 5,
    attendedRecitationCall: false,
    state: 'Open',
    finalisedAt: null,
    finalisedBy: null,
  };

  it('maps an Open row with APIS §10.8 field names and null finalisation facts', () => {
    expect(toWeeklyReportDto(open)).toEqual({
      id: 'weekly-1',
      week_start: '2026-08-29',
      week_end: '2026-09-04',
      expected_days: 6,
      missed_daily_reports: 1,
      missed_daily_memorization: 2,
      missed_daily_revision: 3,
      missed_50_repetitions: 4,
      missed_single_session: 5,
      attended_recitation_call: false,
      state: 'Open',
      finalised_at: null,
      finalised_by: null,
    });
  });

  it('reports finalised_by = Student when the row carries the confirming user id (DBD §14)', () => {
    expect(
      toWeeklyReportDto({
        ...open,
        attendedRecitationCall: true,
        state: 'Finalised',
        finalisedAt: '2026-09-04T09:00:00.000Z',
        finalisedBy: 'student-1',
      }),
    ).toMatchObject({
      state: 'Finalised',
      finalised_at: '2026-09-04T09:00:00.000Z',
      finalised_by: 'Student',
    });
  });

  it('reports finalised_by = Scheduler when finalised with a NULL user id (SAS E-06)', () => {
    expect(
      toWeeklyReportDto({
        ...open,
        state: 'Finalised',
        finalisedAt: '2026-09-04T23:00:00.000Z',
        finalisedBy: null,
      }),
    ).toMatchObject({ finalised_by: 'Scheduler' });
  });

  it('never exposes the membership id', () => {
    expect(toWeeklyReportDto(open)).not.toHaveProperty('membership_id');
    expect(toWeeklyReportDto(open)).not.toHaveProperty('membershipId');
  });
});
