import {
  getNotificationPreferences,
  setNotificationPreference,
  NotificationPreferenceDto,
} from '../notificationPreferences.client';
import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const catalogue: NotificationPreferenceDto[] = [
  {
    category: 'N-01',
    description: 'Daily report not yet submitted',
    is_mutable: true,
    muted: true,
  },
  {
    category: 'N-03',
    description: 'Join request accepted',
    is_mutable: false,
    muted: false,
  },
];

describe('notificationPreferences.client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNotificationPreferences (API-050)', () => {
    it('calls GET /me/notification-preferences and unwraps the APIS §9.1 envelope', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: catalogue });

      const result = await getNotificationPreferences();

      expect(apiClient.get).toHaveBeenCalledWith(
        '/me/notification-preferences',
      );
      expect(result).toEqual(catalogue);
    });

    it('keeps every category, account-critical ones included', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: catalogue });

      const result = await getNotificationPreferences();

      expect(result.map((row) => row.category)).toEqual(['N-01', 'N-03']);
      expect(result[1].is_mutable).toBe(false);
    });

    it('passes an empty catalogue through rather than inventing rows', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });

      expect(await getNotificationPreferences()).toEqual([]);
    });
  });

  describe('setNotificationPreference (API-051)', () => {
    it('calls PATCH with { category, muted } and unwraps the envelope', async () => {
      (apiClient.patch as jest.Mock).mockResolvedValue({ data: catalogue[0] });

      const result = await setNotificationPreference({
        category: 'N-01',
        muted: true,
      });

      expect(apiClient.patch).toHaveBeenCalledWith(
        '/me/notification-preferences',
        { category: 'N-01', muted: true },
      );
      expect(result).toEqual(catalogue[0]);
    });

    it('sends muted=false for an unmute', async () => {
      (apiClient.patch as jest.Mock).mockResolvedValue({
        data: { ...catalogue[0], muted: false },
      });

      const result = await setNotificationPreference({
        category: 'N-01',
        muted: false,
      });

      expect(apiClient.patch).toHaveBeenCalledWith(
        '/me/notification-preferences',
        { category: 'N-01', muted: false },
      );
      expect(result.muted).toBe(false);
    });

    it('lets an ApiError propagate for the caller to map (UF §24)', async () => {
      const failure = new Error('422');
      (apiClient.patch as jest.Mock).mockRejectedValue(failure);

      await expect(
        setNotificationPreference({ category: 'N-03', muted: true }),
      ).rejects.toBe(failure);
    });
  });
});
