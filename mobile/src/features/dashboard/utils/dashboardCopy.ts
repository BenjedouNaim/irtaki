import { ApiError } from '@/shared/api/types';

/** Network unavailable (UF §24) — same copy as every other screen. */
export const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own. */
export const DASHBOARD_SERVER_ERROR_MESSAGE =
  'حدث خطأ أثناء تحميل الصفحة الرئيسية';

/**
 * UF §24's error table for the five home screens: `5xx` and network failures
 * show the generic Arabic retry copy, never the server's message; a
 * remaining `4xx` carries the exception filter's own Arabic message.
 */
export function describeDashboardError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      return DASHBOARD_SERVER_ERROR_MESSAGE;
    }
    return error.message || DASHBOARD_SERVER_ERROR_MESSAGE;
  }
  return NETWORK_ERROR_MESSAGE;
}

/**
 * A rate as SCR-08/SCR-22 print it. `null` NEVER becomes `0%`
 * (DEC-B04 / API-X07) — the caller renders it as MetricTile's null state
 * ("بيانات غير كافية"), the same rule SCR-13 and SCR-23 already follow.
 */
export function formatRate(rate: number | null): string | null {
  return rate === null ? null : `${Math.round(rate)}%`;
}
