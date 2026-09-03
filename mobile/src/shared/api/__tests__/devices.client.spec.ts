import { DeviceTokenDto, registerDevice } from '../devices.client';
import { apiClient } from '../client';
import { ApiError, NetworkError } from '../types';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const device: DeviceTokenDto = {
  id: '0192f0c1-0000-7000-8000-000000000001',
  token: 'ExponentPushToken[abc]',
  platform: 'iOS',
  registered_at: '2026-09-01T08:00:00.000Z',
  last_seen_at: '2026-09-03T08:00:00.000Z',
  invalidated_at: null,
};

describe('devices.client (API-048 / API-049)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerDevice', () => {
    it('calls POST /devices and unwraps the APIS §9.1 envelope', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: device });

      const result = await registerDevice({
        token: 'ExponentPushToken[abc]',
        platform: 'iOS',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/devices', {
        token: 'ExponentPushToken[abc]',
        platform: 'iOS',
      });
      expect(result).toEqual(device);
    });

    it('sends the Android platform verbatim — the contract is case-exact', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({
        data: { ...device, platform: 'Android' },
      });

      const result = await registerDevice({
        token: 'ExponentPushToken[abc]',
        platform: 'Android',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/devices', {
        token: 'ExponentPushToken[abc]',
        platform: 'Android',
      });
      expect(result.platform).toBe('Android');
    });

    it('is safe to repeat — a re-registration returns the same id (VR-29)', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: device });

      const first = await registerDevice({
        token: device.token,
        platform: 'iOS',
      });
      const second = await registerDevice({
        token: device.token,
        platform: 'iOS',
      });

      expect(second.id).toBe(first.id);
      expect(apiClient.post).toHaveBeenCalledTimes(2);
    });

    it('propagates apiClient errors unchanged (422 on a bad platform)', async () => {
      const error = new ApiError({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'فشل التحقق من صحة البيانات المدخلة',
      });
      (apiClient.post as jest.Mock).mockRejectedValue(error);

      await expect(
        registerDevice({ token: 'x', platform: 'iOS' }),
      ).rejects.toBe(error);
    });

    it('propagates a NetworkError unchanged for the UF §24 generic copy', async () => {
      const error = new NetworkError('Network request failed');
      (apiClient.post as jest.Mock).mockRejectedValue(error);

      await expect(
        registerDevice({ token: 'x', platform: 'iOS' }),
      ).rejects.toBe(error);
    });
  });
});
