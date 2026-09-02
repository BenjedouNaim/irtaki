import {
  getTodayReportStatus,
  TodayReportStatusDto,
} from '../dailyReports.client';
import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockStatus: TodayReportStatusDto = {
  can_submit: false,
  block_reason: 'already_submitted',
  existing_report: {
    id: 'report-1',
    report_date: '2026-09-02',
    type: 'Normal',
    submitted_at: '2026-09-02T08:30:00.000Z',
    submitted_timezone: 'Africa/Tunis',
    no_memorization_today: false,
    memo_range: { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } },
    memo_time: { from: '18:00', to: '18:45' },
    completed_50_repetitions: true,
    repetitions_in_single_session: true,
    no_revision_today: true,
    rev_range: null,
    rev_time: null,
    read_tafsir: false,
    absence_reason: null,
  },
};

describe('dailyReports.client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTodayReportStatus', () => {
    it('should call apiClient.get with /daily-reports/today and unwrap the APIS §9.1 envelope { data: {...} }', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockStatus });

      const result = await getTodayReportStatus();

      expect(apiClient.get).toHaveBeenCalledWith('/daily-reports/today');
      expect(result).toEqual(mockStatus);
      expect(result.existing_report?.memo_range?.from).toEqual({
        surah: 2,
        ayah: 1,
      });
    });

    it('should pass through a can_submit=true payload without optional keys', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: { can_submit: true },
      });

      const result = await getTodayReportStatus();

      expect(result).toEqual({ can_submit: true });
      expect(result).not.toHaveProperty('block_reason');
      expect(result).not.toHaveProperty('existing_report');
    });

    it('should propagate apiClient errors unchanged', async () => {
      const error = new Error('boom');
      (apiClient.get as jest.Mock).mockRejectedValue(error);

      await expect(getTodayReportStatus()).rejects.toBe(error);
    });
  });
});
