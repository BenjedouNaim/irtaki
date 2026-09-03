import {
  getGroupPerformance,
  getMembershipPerformance,
  getMyPerformance,
  GroupPerformanceDto,
  PerformanceDto,
} from '../performance.client';
import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockPerformance: PerformanceDto = {
  commitment_score: 77.5,
  submission_rate: 80,
  memorization_rate: 50,
  revision_rate: 80,
  attendance_rate: 100,
  repetition_quality: 50,
  day_breakdown: {
    normal: 3,
    revision: 1,
    absent_excused: 1,
    absent_other: 0,
    no_report: 1,
  },
  days_since_last_report: 1,
};

const mockGroupPerformance: GroupPerformanceDto = {
  commitment_average: 62,
  students: [
    { membership_id: 'm-1', full_name: 'يوسف بن سالم', commitment_score: 41 },
    { membership_id: 'm-2', full_name: null, commitment_score: null },
  ],
  absence_breakdown: { sick: 2, studying: 1, other: 3 },
  submission_rate: 83,
};

describe('performance.client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyPerformance', () => {
    it('calls /me/performance and unwraps the APIS §9.1 envelope { data: {...} }', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: mockPerformance,
      });

      const result = await getMyPerformance();

      expect(apiClient.get).toHaveBeenCalledWith('/me/performance', {
        params: {},
      });
      expect(result).toEqual(mockPerformance);
    });

    it('sends the ?period= filter (APIS §9.3)', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: mockPerformance,
      });

      await getMyPerformance({ period: '3months' });

      expect(apiClient.get).toHaveBeenCalledWith('/me/performance', {
        params: { period: '3months' },
      });
    });

    it('sends from/to only for a custom period, which the API requires', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: mockPerformance,
      });

      await getMyPerformance({
        period: 'custom',
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/me/performance', {
        params: { period: 'custom', from: '2026-01-01', to: '2026-01-31' },
      });
    });

    it('drops from/to on a non-custom period (they do not apply)', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: mockPerformance,
      });

      await getMyPerformance({
        period: 'week',
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/me/performance', {
        params: { period: 'week' },
      });
    });

    it('passes every null rate through untouched, never coercing to 0 (DEC-B04)', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: {
          ...mockPerformance,
          commitment_score: null,
          submission_rate: null,
          memorization_rate: null,
          revision_rate: null,
          attendance_rate: null,
          repetition_quality: null,
        },
      });

      const result = await getMyPerformance();

      expect(result.commitment_score).toBeNull();
      expect(result.submission_rate).toBeNull();
      expect(result.memorization_rate).toBeNull();
      expect(result.revision_rate).toBeNull();
      expect(result.attendance_rate).toBeNull();
      expect(result.repetition_quality).toBeNull();
      expect(result.days_since_last_report).toBe(1);
    });

    it('propagates apiClient errors unchanged', async () => {
      const error = new Error('boom');
      (apiClient.get as jest.Mock).mockRejectedValue(error);

      await expect(getMyPerformance()).rejects.toBe(error);
    });
  });

  describe('getGroupPerformance (API-038)', () => {
    it('calls /groups/{id}/performance and unwraps the §9.1 envelope', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: mockGroupPerformance,
      });

      const result = await getGroupPerformance('group-1');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/groups/group-1/performance',
        { params: {} },
      );
      expect(result).toEqual(mockGroupPerformance);
    });

    it('sends the ?period= filter and drops from/to on a non-custom period', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: mockGroupPerformance,
      });

      await getGroupPerformance('group-1', {
        period: 'month',
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/groups/group-1/performance',
        { params: { period: 'month' } },
      );
    });

    it('keeps the server’s weakest-first order and every null untouched', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: {
          ...mockGroupPerformance,
          commitment_average: null,
          submission_rate: null,
        },
      });

      const result = await getGroupPerformance('group-1');

      expect(result.commitment_average).toBeNull();
      expect(result.submission_rate).toBeNull();
      expect(result.students.map((s) => s.membership_id)).toEqual([
        'm-1',
        'm-2',
      ]);
      expect(result.students[1].commitment_score).toBeNull();
      expect(result.students[1].full_name).toBeNull();
    });

    it('propagates apiClient errors unchanged', async () => {
      const error = new Error('boom');
      (apiClient.get as jest.Mock).mockRejectedValue(error);

      await expect(getGroupPerformance('group-1')).rejects.toBe(error);
    });
  });

  describe('getMembershipPerformance (API-039)', () => {
    it('calls /memberships/{id}/performance and unwraps the §9.1 envelope', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPerformance });

      const result = await getMembershipPerformance('membership-1');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/memberships/membership-1/performance',
        { params: {} },
      );
      expect(result).toEqual(mockPerformance);
    });

    it('sends the ?period= filter and drops from/to on a non-custom period', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPerformance });

      await getMembershipPerformance('membership-1', {
        period: '3months',
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/memberships/membership-1/performance',
        { params: { period: '3months' } },
      );
    });

    it('sends from/to when the period IS custom (APIS §10.9)', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockPerformance });

      await getMembershipPerformance('membership-1', {
        period: 'custom',
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/memberships/membership-1/performance',
        { params: { period: 'custom', from: '2026-01-01', to: '2026-01-31' } },
      );
    });

    it('leaves every null rate untouched — never 0 (DEC-B04)', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: {
          ...mockPerformance,
          commitment_score: null,
          attendance_rate: null,
          repetition_quality: null,
        },
      });

      const result = await getMembershipPerformance('membership-1');

      expect(result.commitment_score).toBeNull();
      expect(result.attendance_rate).toBeNull();
      expect(result.repetition_quality).toBeNull();
    });

    it('propagates apiClient errors unchanged', async () => {
      const error = new Error('boom');
      (apiClient.get as jest.Mock).mockRejectedValue(error);

      await expect(getMembershipPerformance('membership-1')).rejects.toBe(
        error,
      );
    });
  });
});
