export interface CursorPayload<T = unknown> {
  id: string;
  sortKey: T;
}

export function encodeCursor<T = unknown>(payload: CursorPayload<T>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export function decodeCursor<T = unknown>(
  cursor?: string | null,
): CursorPayload<T> | null {
  if (!cursor || typeof cursor !== 'string') {
    return null;
  }
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf-8');
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'id' in parsed &&
      typeof parsed.id === 'string' &&
      'sortKey' in parsed &&
      parsed.sortKey !== undefined
    ) {
      return parsed as CursorPayload<T>;
    }
    return null;
  } catch {
    return null;
  }
}

export interface ClampLimitOptions {
  default?: number;
  min?: number;
  max?: number;
}

export function clampLimit(
  raw: unknown,
  options: ClampLimitOptions = {},
): number {
  const defaultLimit = options.default ?? 20;
  const minLimit = options.min ?? 1;
  const maxLimit = options.max ?? 100;

  if (raw === undefined || raw === null || raw === '') {
    return defaultLimit;
  }

  const parsed = Number(raw);
  if (isNaN(parsed) || !Number.isFinite(parsed)) {
    return defaultLimit;
  }

  const intVal = Math.floor(parsed);
  if (intVal < minLimit) {
    return minLimit;
  }
  if (intVal > maxLimit) {
    return maxLimit;
  }
  return intVal;
}
