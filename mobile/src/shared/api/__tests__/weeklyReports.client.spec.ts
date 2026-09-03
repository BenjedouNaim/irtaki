import {
  confirmWeeklyReport,
  getCurrentWeeklyReport,
  WeeklyReportDto,
  WeeklyReportLiveDto,
} from '../weeklyReports.client';
import { apiClient } from '../client';
import { ApiError } from '../types';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const liveReport: WeeklyReportLiveDto = {
  id: null,
  week_start: '2026-08-29',
  week_end: '2026-09-04',
  expected_days: 5,
  missed_daily_reports: 2,
  missed_daily_memorization: 2,
  missed_daily_revision: 3,
  missed_50_repetitions: 1,
  missed_single_session: 0,
  attended_recitation_call: false,
  state: 'Open',
  can_confirm: false,
};

describe('weeklyReports.client (API-033 / API-034)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentWeeklyReport', () => {
    it('calls GET /weekly-reports/current and unwraps the APIS §9.1 envelope', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: liveReport });

      const result = await getCurrentWeeklyReport();

      expect(apiClient.get).toHaveBeenCalledWith('/weekly-reports/current');
      expect(result).toEqual(liveReport);
      expect(result.id).toBeNull();
      expect(result.can_confirm).toBe(false);
    });

    it('passes a stored recitation-day row through untouched', async () => {
      const stored: WeeklyReportLiveDto = {
        ...liveReport,
        id: 'weekly-1',
        expected_days: 6,
        can_confirm: true,
      };
      (apiClient.get as jest.Mock).mockResolvedValue({ data: stored });

      const result = await getCurrentWeeklyReport();

      expect(result).toEqual(stored);
    });

    it('propagates apiClient errors unchanged (404 for no Active membership)', async () => {
      const error = new ApiError({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
      (apiClient.get as jest.Mock).mockRejectedValue(error);

      await expect(getCurrentWeeklyReport()).rejects.toBe(error);
    });
  });

  describe('confirmWeeklyReport (API-034)', () => {
    const finalised: WeeklyReportDto = {
      id: 'weekly-1',
      week_start: '2026-08-29',
      week_end: '2026-09-04',
      expected_days: 6,
      missed_daily_reports: 2,
      missed_daily_memorization: 2,
      missed_daily_revision: 3,
      missed_50_repetitions: 1,
      missed_single_session: 0,
      attended_recitation_call: true,
      state: 'Finalised',
      finalised_at: '2026-09-04T09:00:00.000Z',
      finalised_by: 'Student',
    };

    it('POSTs /weekly-reports/{id}/confirm with the APIS §10.8 body and unwraps the envelope', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: finalised });

      const result = await confirmWeeklyReport('weekly-1', {
        attended_recitation_call: true,
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/weekly-reports/weekly-1/confirm',
        { attended_recitation_call: true },
      );
      expect(result).toEqual(finalised);
    });

    it('encodes the id in the path', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: finalised });

      await confirmWeeklyReport('a/b', { attended_recitation_call: false });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/weekly-reports/a%2Fb/confirm',
        { attended_recitation_call: false },
      );
    });

    it.each([
      [409, 'ALREADY_FINALISED'],
      [422, 'NOT_RECITATION_DAY'],
      [403, 'SCOPE_DENIED'],
    ])('propagates a %s %s ApiError unchanged', async (statusCode, code) => {
      const error = new ApiError({ statusCode, error: code, message: 'x' });
      (apiClient.post as jest.Mock).mockRejectedValue(error);

      await expect(
        confirmWeeklyReport('weekly-1', { attended_recitation_call: true }),
      ).rejects.toBe(error);
    });
  });
});
