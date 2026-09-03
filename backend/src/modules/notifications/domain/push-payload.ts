import type { NotificationEventType } from './notification-event';

/**
 * BR-46 / FR-NOTIF-07 / SAS §22.4, restated verbatim by SA §21: "Payload
 * type structurally limited: `{ eventType: NotificationCategory; resourceId:
 * string }` — no name/content/score/amount field exists on the type at all
 * (BR-46, enforced by TypeScript, not convention)."
 *
 * Push payloads render on locked screens and traverse a third party
 * (EXT-03); NFR-10 restricts exactly this data. There is therefore no title,
 * no body and no data field beyond these two — the app resolves its own
 * Arabic copy from `eventType` and fetches whatever it needs with
 * `resourceId`.
 *
 * Framework-free (TS §9). Instances are frozen.
 */
export interface PushPayload {
  readonly eventType: NotificationEventType;
  readonly resourceId: string;
}

/** The two field names BR-46 permits — asserted by the payload-shape test. */
export const PUSH_PAYLOAD_FIELDS: readonly ['eventType', 'resourceId'] = [
  'eventType',
  'resourceId',
];

/**
 * Structural exactness: every key beyond BR-46's two collapses to `never`,
 * so `buildPushPayload({ eventType, resourceId, score })` does not compile.
 * This is the "enforced by the TypeScript type itself, not by convention"
 * half of BR-46; `buildPushPayload`'s projection below is the runtime half.
 */
export type OnlyPushPayload<T extends PushPayload> = T &
  Record<Exclude<keyof T, keyof PushPayload>, never>;

/**
 * The ONE way a `PushPayload` is constructed. It projects its argument onto
 * exactly `eventType` and `resourceId` and freezes the result, so no value
 * of any wider type can smuggle a third field past the compiler into the
 * transport — not even through an `as` cast at the call site.
 */
export function buildPushPayload<T extends PushPayload>(
  payload: OnlyPushPayload<T>,
): PushPayload {
  return Object.freeze({
    eventType: payload.eventType,
    resourceId: payload.resourceId,
  });
}
