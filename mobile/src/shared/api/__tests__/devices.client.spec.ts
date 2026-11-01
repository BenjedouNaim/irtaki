import { apiClient } from '../client';
import { registerDevice, unregisterDevice } from '../devices.client';

jest.mock('../client', () => ({
  apiClient: { post: jest.fn(), delete: jest.fn() },
}));

it('registers only the token/platform using explicit owner credentials', async () => {
  jest.mocked(apiClient.post).mockResolvedValue({ data: { id: 'device-1' } });
  expect(await registerDevice('fcm-token', 'Android', 'owner-token')).toEqual({
    id: 'device-1',
  });
  expect(apiClient.post).toHaveBeenCalledWith(
    '/devices',
    { token: 'fcm-token', platform: 'Android' },
    {
      skipAuth: true,
      headers: { Authorization: 'Bearer owner-token' },
    },
  );
});

it('unregisters only the saved resource under its owner session', async () => {
  await unregisterDevice('device-1', 'owner-token');
  expect(apiClient.delete).toHaveBeenCalledWith('/devices/device-1', {
    skipAuth: true,
    headers: { Authorization: 'Bearer owner-token' },
  });
});
