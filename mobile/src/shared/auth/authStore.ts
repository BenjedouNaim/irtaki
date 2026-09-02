import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Role } from './types';

export const REFRESH_TOKEN_KEY = 'irtaki_refresh_token';

export function parseUserIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export interface AuthState {
  accessToken: string | null;
  role: Role | null;
  userId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setSession: (accessToken: string, role: Role) => void;
  clearSession: () => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  role: null,
  userId: null,
  isAuthenticated: false,
  isLoading: true,
  setSession: (accessToken: string, role: Role) =>
    set({
      accessToken,
      role,
      userId: parseUserIdFromToken(accessToken),
      isAuthenticated: true,
      isLoading: false,
    }),
  clearSession: () =>
    set({
      accessToken: null,
      role: null,
      userId: null,
      isAuthenticated: false,
      isLoading: false,
    }),
  setLoading: (isLoading: boolean) => set({ isLoading }),
}));

export async function getStoredRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function storeRefreshToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch {
    // secure store error handling
  }
}

export async function deleteStoredRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // secure store error handling
  }
}
