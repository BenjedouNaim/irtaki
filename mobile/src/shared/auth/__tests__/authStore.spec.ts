import {
  useAuthStore,
  getStoredRefreshToken,
  storeRefreshToken,
  deleteStoredRefreshToken,
  REFRESH_TOKEN_KEY,
} from '../authStore';
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('AuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
    jest.clearAllMocks();
  });

  it('initializes with unauthenticated state', () => {
    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.role).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('updates state when setSession is called', () => {
    useAuthStore.getState().setSession('access-token-123', 'Student');
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('access-token-123');
    expect(state.role).toBe('Student');
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('clears state when clearSession is called', () => {
    useAuthStore.getState().setSession('access-token-123', 'Student');
    useAuthStore.getState().clearSession();
    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.role).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('delegates to SecureStore for refresh token persistence', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(
      'saved-refresh-token',
    );

    const token = await getStoredRefreshToken();
    expect(token).toBe('saved-refresh-token');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(REFRESH_TOKEN_KEY);

    await storeRefreshToken('new-refresh-token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      REFRESH_TOKEN_KEY,
      'new-refresh-token',
    );

    await deleteStoredRefreshToken();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(REFRESH_TOKEN_KEY);
  });
});
