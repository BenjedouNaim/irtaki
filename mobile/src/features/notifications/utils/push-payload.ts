export const PUSH_EVENTS = [
  'N-01',
  'N-02',
  'N-03',
  'N-04',
  'N-05',
  'N-06',
  'N-07',
  'N-08',
] as const;
export type PushEvent = (typeof PUSH_EVENTS)[number];
export interface PushPayload {
  eventType: PushEvent;
  resourceId: string;
}

/** Never treat an incoming push as a route or render its untrusted text. */
export function parsePushPayload(value: unknown): PushPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const data = value as Record<string, unknown>;
  if (
    !PUSH_EVENTS.includes(data.eventType as PushEvent) ||
    typeof data.resourceId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      data.resourceId,
    )
  )
    return null;
  return {
    eventType: data.eventType as PushEvent,
    resourceId: data.resourceId,
  };
}

export const GENERIC_PUSH_COPY = {
  title: 'ارتقِ',
  body: 'لديك إشعار جديد. افتح التطبيق للاطلاع عليه.',
} as const;
