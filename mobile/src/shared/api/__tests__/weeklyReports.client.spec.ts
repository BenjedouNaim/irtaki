import {
  getCurrentWeeklyReport,
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

describe('weeklyReports.client (API-033)', () => {
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
});
