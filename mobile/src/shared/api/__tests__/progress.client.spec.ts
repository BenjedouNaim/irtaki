import { getMyProgress, ProgressDto } from '../progress.client';
import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockProgress: ProgressDto = {
  ahzab_completed: 23,
  coverage_percent: 38.5,
  last_memorized_position: { surah: 2, ayah: 142, ordinal: 149 },
  is_activity_pointer_only: true,
};

describe('progress.client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyProgress', () => {
    it('should call apiClient.get with /me/progress and return the bare body', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue(mockProgress);

      const result = await getMyProgress();

      expect(apiClient.get).toHaveBeenCalledWith('/me/progress');
      expect(result).toEqual(mockProgress);
      expect(result.is_activity_pointer_only).toBe(true);
    });

    it('should unwrap the APIS §9.1 single-resource envelope { data: {...} }', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockProgress });

      const result = await getMyProgress();

      expect(result).toEqual(mockProgress);
    });

    it('should pass through a null last_memorized_position untouched', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        ...mockProgress,
        ahzab_completed: 0,
        coverage_percent: 0,
        last_memorized_position: null,
      });

      const result = await getMyProgress();

      expect(result.last_memorized_position).toBeNull();
      expect(result.ahzab_completed).toBe(0);
    });

    it('should propagate apiClient errors unchanged', async () => {
      const error = new Error('boom');
      (apiClient.get as jest.Mock).mockRejectedValue(error);

      await expect(getMyProgress()).rejects.toBe(error);
    });
  });
});
