import { apiClient, getBaseUrl, refreshAccessToken } from '../client';
import { useAuthStore } from '../../auth/authStore';
import * as SecureStore from 'expo-secure-store';
import { ApiError, NetworkError } from '../types';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('ApiClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useAuthStore.getState().clearSession();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resolves base URL', () => {
    const url = getBaseUrl();
    expect(url).toBeDefined();
    expect(url.endsWith('/')).toBe(false);
  });

  it('attaches Authorization header when accessToken exists in authStore', async () => {
    useAuthStore.getState().setSession('valid-jwt-token', 'User');

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ id: '123' }),
    });
    global.fetch = mockFetch;

    const result = await apiClient.get<{ id: string }>('/me');

    expect(result).toEqual({ id: '123' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-jwt-token',
        }),
      }),
    );
  });

  it('throws ApiError on non-2xx HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: jest.fn().mockResolvedValue({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'بيانات غير صالحة',
        details: [{ field: 'email', message: 'بريد غير صالح' }],
      }),
    });

    await expect(apiClient.post('/join-requests', {})).rejects.toThrow(
      ApiError,
    );
  });

  it('throws NetworkError on fetch exception', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Failed to connect'));

    await expect(apiClient.get('/groups')).rejects.toThrow(NetworkError);
  });

  it('attempts silent refresh on 401 response and replays original request on success', async () => {
    useAuthStore.getState().setSession('expired-token', 'Student');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      'valid-refresh-token',
    );

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: 'new-refreshed-token',
              refresh_token: 'new-rotated-refresh-token',
            }),
        });
      }

      if (callCount === 1) {
        // First attempt gets 401
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () =>
            Promise.resolve({
              statusCode: 401,
              error: 'TOKEN_EXPIRED',
              message: 'انتهت الجلسة',
            }),
        });
      }

      // Second attempt (replay) succeeds
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
    });

    const result = await apiClient.get<{ success: boolean }>('/me/dashboard');

    expect(result).toEqual({ success: true });
    expect(useAuthStore.getState().accessToken).toBe('new-refreshed-token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'irtaki_refresh_token',
      'new-rotated-refresh-token',
    );
  });

  it('clears session on refresh failure (401)', async () => {
    useAuthStore.getState().setSession('expired-token', 'Student');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
      'invalid-refresh-token',
    );

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () =>
            Promise.resolve({
              statusCode: 401,
              error: 'INVALID_TOKEN',
              message: 'جلسة ملغاة',
            }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            statusCode: 401,
            error: 'UNAUTHORIZED',
            message: 'غير مصرح',
          }),
      });
    });

    const refreshResult = await refreshAccessToken();
    expect(refreshResult).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });
});
