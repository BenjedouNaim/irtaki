import type { PushPayload } from './push-payload';

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/**
 * The three transport answers SA §21's `alt` block branches on: a delivered
 * push, a token the provider rejected as invalid (E-09 `invalidated_at`,
 * UC-15 E2) and a transient failure (retried at most once, SAS §22.5).
 */
export type PushSendStatus = 'sent' | 'invalid-token' | 'transient-failure';

export interface PushSendResult {
  status: PushSendStatus;
  /** `notification_log.transport_reference` — the provider message id. */
  transportReference: string | null;
  /** Human-readable cause, for the WARN/INFO log line only (TS §30). */
  detail?: string;
}

/**
 * EXT-03 push transport port (ADR-020: FCM via Expo's push service, which
 * bridges to APNs automatically). The adapter behind it NEVER throws — a
 * transport failure is an outcome, not an exception, because BR-60 makes
 * delivery best-effort and ADR-032 forbids it reaching the triggering
 * request.
 */
export interface IPushSender {
  send(token: string, payload: PushPayload): Promise<PushSendResult>;
}
