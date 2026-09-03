import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushPayload } from '../domain/push-payload';
import type {
  IPushSender,
  PushSendResult,
} from '../domain/push-sender.interface';

/** Expo's push endpoint — ADR-020's provider, which bridges FCM→APNs. */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Outbound budget: a push must never hold a job tick or a listener open. */
const SEND_TIMEOUT_MS = 10_000;

/** Expo's `DeviceNotRegistered` — the only "never retry" error (SAS §22.5). */
const INVALID_TOKEN_ERRORS = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
]);

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * EXT-03 push transport adapter — FCM via Expo's push service (ADR-020,
 * TS §6 "Push | FCM via Expo"), reached with the platform `fetch` exactly as
 * `MailgunMailer` reaches Mailgun and `HealthchecksPingService` reaches
 * Healthchecks.io. No new dependency: SA/TS name no client library, so none
 * is added (AGENTS §4).
 *
 * The request body carries **only** `to` and `data` — `data` being the
 * BR-46 payload, whose type admits two fields and whose factory freezes the
 * projection. There is deliberately no `title` and no `body`: a push
 * renders on a locked screen and traverses a third party (NFR-10), so the
 * app resolves its own Arabic copy from `eventType` and fetches the rest
 * with `resourceId`.
 *
 * It never throws (BR-60, ADR-032). An unconfigured transport in
 * development is the same shape of answer as an unreachable one — a
 * transient failure, logged at WARN (TS §30) — which `NotificationService`
 * records as `Failed` rather than pretending a push went out.
 */
@Injectable()
export class ExpoPushSender implements IPushSender {
  private readonly logger = new Logger(ExpoPushSender.name);
  private warnedUnconfigured = false;

  constructor(private readonly configService: ConfigService) {}

  async send(token: string, payload: PushPayload): Promise<PushSendResult> {
    const credentials = this.configService
      .get<string>('FCM_SERVICE_ACCOUNT_JSON')
      ?.trim();

    if (!credentials) {
      if (!this.warnedUnconfigured) {
        this.warnedUnconfigured = true;
        this.logger.warn(
          'Push transport inactive: FCM_SERVICE_ACCOUNT_JSON is not set, no notification can be delivered from this instance',
        );
      }
      return {
        status: 'transient-failure',
        transportReference: null,
        detail: 'FCM_SERVICE_ACCOUNT_JSON is not configured',
      };
    }

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ to: token, data: payload }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        return {
          status: 'transient-failure',
          transportReference: null,
          detail: `Expo push answered HTTP ${response.status}`,
        };
      }

      const body = (await response.json()) as { data?: ExpoTicket };
      const ticket = body.data;

      if (ticket?.status === 'ok') {
        return {
          status: 'sent',
          transportReference: ticket.id ?? null,
          detail: undefined,
        };
      }

      const error = ticket?.details?.error;
      if (error !== undefined && INVALID_TOKEN_ERRORS.has(error)) {
        return {
          status: 'invalid-token',
          transportReference: null,
          detail: error,
        };
      }

      return {
        status: 'transient-failure',
        transportReference: null,
        detail: ticket?.message ?? 'Expo push returned no ticket',
      };
    } catch (err: unknown) {
      return {
        status: 'transient-failure',
        transportReference: null,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
