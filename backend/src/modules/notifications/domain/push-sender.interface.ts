import type { PushPayload } from './push-payload';

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/**
 * Transport results separate an FCM-accepted
 * push, a token the provider rejected as invalid (E-09 `invalidated_at`,
 * UC-15 E2), transient failures (retried once), and permanent failures
 * (no retry, no token invalidation).
 */
export type PushSendStatus =
  'sent' | 'invalid-token' | 'transient-failure' | 'permanent-failure';

export interface PushSendResult {
  status: PushSendStatus;
  /** `notification_log.transport_reference` — the provider message id. */
  transportReference: string | null;
  /** Human-readable cause, for the WARN/INFO log line only (TS §30). */
  detail?: string;
}

/**
 * EXT-03 push transport port (approved direct-FCM transition). Permanent
 * configuration/payload failures must not invalidate a healthy device token.
 * The adapter behind it NEVER throws — a
 * transport failure is an outcome, not an exception, because BR-60 makes
 * delivery best-effort and ADR-032 forbids it reaching the triggering
 * request.
 */
export interface IPushSender {
  send(token: string, payload: PushPayload): Promise<PushSendResult>;
}
