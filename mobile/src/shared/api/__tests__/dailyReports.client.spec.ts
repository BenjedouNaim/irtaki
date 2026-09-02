import {
  getTodayReportStatus,
  listOwnDailyReports,
  ListOwnDailyReportsResponse,
  submitDailyReport,
  SubmitDailyReportPayload,
  TodayReportStatusDto,
} from '../dailyReports.client';
import { apiClient } from '../client';
import { ApiError } from '../types';

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

  describe('submitDailyReport', () => {
    const payload: SubmitDailyReportPayload = {
      type: 'Normal',
      report_date: '2026-09-02',
      memo_range: { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } },
      memo_time: { from: '18:00', to: '18:45' },
      completed_50_repetitions: true,
      repetitions_in_single_session: true,
      read_tafsir: false,
    };

    it('should POST /daily-reports with the payload and unwrap the APIS §9.1 envelope', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({
        data: {
          id: 'report-1',
          report_date: '2026-09-02',
          type: 'Normal',
          ahzab_completed: 4,
          coverage_updated: true,
        },
      });

      const result = await submitDailyReport(payload);

      expect(apiClient.post).toHaveBeenCalledWith('/daily-reports', payload);
      expect(result).toEqual({
        id: 'report-1',
        report_date: '2026-09-02',
        type: 'Normal',
        ahzab_completed: 4,
        coverage_updated: true,
      });
    });

    it('should propagate a 409 DUPLICATE_REPORT ApiError unchanged, carrying existingReport (APIQ-09)', async () => {
      const error = new ApiError({
        statusCode: 409,
        error: 'DUPLICATE_REPORT',
        message: 'لقد قمت بإرسال تقرير اليوم مسبقاً',
        existing_report: mockStatus.existing_report,
      });
      (apiClient.post as jest.Mock).mockRejectedValue(error);

      await expect(submitDailyReport(payload)).rejects.toBe(error);
      expect(error.existingReport).toEqual(mockStatus.existing_report);
    });
  });

  describe('listOwnDailyReports (API-031)', () => {
    const page: ListOwnDailyReportsResponse = {
      data: [mockStatus.existing_report!],
      pagination: { next_cursor: 'eyJpZCI6IjEifQ==', has_more: true },
    };

    it('should GET /daily-reports with only limit on the first page and return the whole { data, pagination } envelope (APIS §9.1/§9.2)', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(page);

      const result = await listOwnDailyReports({ limit: 20 });

      expect(apiClient.get).toHaveBeenCalledWith('/daily-reports', {
        params: { limit: 20 },
      });
      expect(result).toEqual(page);
      expect(result.pagination.has_more).toBe(true);
    });

    it('should send the opaque cursor and the from/to filters when given', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(page);

      await listOwnDailyReports({
        cursor: 'eyJpZCI6IjEifQ==',
        from: '2026-08-01',
        to: '2026-08-31',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/daily-reports', {
        params: {
          from: '2026-08-01',
          to: '2026-08-31',
          cursor: 'eyJpZCI6IjEifQ==',
        },
      });
    });

    it('should send no params at all by default', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(page);

      await listOwnDailyReports();

      expect(apiClient.get).toHaveBeenCalledWith('/daily-reports', {
        params: {},
      });
    });

    it('should propagate apiClient errors unchanged', async () => {
      const error = new ApiError({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      });
      (apiClient.get as jest.Mock).mockRejectedValue(error);

      await expect(listOwnDailyReports()).rejects.toBe(error);
    });
  });
});
