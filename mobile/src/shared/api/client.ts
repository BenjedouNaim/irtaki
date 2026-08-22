import Constants from 'expo-constants';
import {
  useAuthStore,
  getStoredRefreshToken,
  storeRefreshToken,
  deleteStoredRefreshToken,
} from '../auth/authStore';
import {
  ApiError,
  ApiErrorEnvelope,
  NetworkError,
  RequestOptions,
} from './types';

export function getBaseUrl(): string {
  const envUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    (Constants.expoConfig?.extra?.apiUrl as string | undefined);

  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  return 'http://localhost:3000/api/v1';
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const storedRefreshToken = await getStoredRefreshToken();
      if (!storedRefreshToken) {
        useAuthStore.getState().clearSession();
        return null;
      }

      const url = `${getBaseUrl()}/auth/refresh`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: storedRefreshToken,
        }),
      });

      if (!response.ok) {
        await deleteStoredRefreshToken();
        useAuthStore.getState().clearSession();
        return null;
      }

      const data = await response.json();
      const payload = data.data || data;
      const newAccessToken = payload.access_token || payload.accessToken;
      const newRefreshToken = payload.refresh_token || payload.refreshToken;

      if (newRefreshToken) {
        await storeRefreshToken(newRefreshToken);
      }

      let role = useAuthStore.getState().role;
      if (!role && newAccessToken) {
        try {
          const parts = newAccessToken.split('.');
          if (parts[1]) {
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const binaryStr = typeof atob !== 'undefined'
              ? atob(base64)
              : Buffer.from(base64, 'base64').toString('binary');
            const decoded = JSON.parse(binaryStr);
            if (decoded && decoded.role) {
              role = decoded.role;
            }
          }
        } catch {
          // ignore decode error
        }
      }

      if (newAccessToken && role) {
        useAuthStore.getState().setSession(newAccessToken, role);
      } else if (newAccessToken) {
        useAuthStore.setState({
          accessToken: newAccessToken,
          isAuthenticated: true,
        });
      }

      return newAccessToken ?? null;
    } catch {
      await deleteStoredRefreshToken();
      useAuthStore.getState().clearSession();
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const baseUrl = getBaseUrl();
  const normalizedEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;

  let urlString = `${baseUrl}${normalizedEndpoint}`;
  if (options.params) {
    const searchParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    const query = searchParams.toString();
    if (query) {
      urlString += (urlString.includes('?') ? '&' : '?') + query;
    }
  }

  const { skipAuth, body, headers: customHeaders, ...restOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (!skipAuth) {
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(urlString, {
      ...restOptions,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    throw new NetworkError(
      err instanceof Error ? err.message : 'Network request failed',
    );
  }

  // Handle 401 unauthorized & silent refresh
  if (
    response.status === 401 &&
    !skipAuth &&
    !endpoint.includes('/auth/refresh')
  ) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      headers.Authorization = `Bearer ${newAccessToken}`;
      try {
        response = await fetch(urlString, {
          ...restOptions,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (err: unknown) {
        throw new NetworkError(
          err instanceof Error ? err.message : 'Network request failed',
        );
      }
    }
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  if (!response.ok) {
    let errorEnvelope: ApiErrorEnvelope;
    try {
      errorEnvelope = await response.json();
    } catch {
      errorEnvelope = {
        statusCode: response.status,
        error: 'HTTP_ERROR',
        message: 'حدث خطأ في الاتصال بالخادم',
      };
    }
    throw new ApiError(errorEnvelope);
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'POST', body }),
  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body }),
  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PUT', body }),
  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
