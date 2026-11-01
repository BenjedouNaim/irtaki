import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PushPayload } from '../domain/push-payload';
import type {
  IPushSender,
  PushSendResult,
} from '../domain/push-sender.interface';

const INVALID_TOKEN_ERRORS = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);
const TRANSIENT_ERRORS = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'app/network-error',
  'app/network-timeout',
]);

/** Static, approved lock-screen copy. Never interpolate domain/user data. */
export const FCM_NOTIFICATION = Object.freeze({
  title: 'ارتقِ',
  body: 'لديك إشعار جديد. افتح التطبيق للاطلاع عليه.',
});

/** Direct FCM for Android and iOS; Firebase manages the APNs connection. */
@Injectable()
export class FcmPushSender implements IPushSender, OnModuleDestroy {
  private app: App | undefined;

  constructor(private readonly config: ConfigService) {}

  async send(token: string, payload: PushPayload): Promise<PushSendResult> {
    // Expo tokens belong to the retired transport. Do not send them to FCM.
    if (/^(Exponent|Expo)PushToken\[/.test(token)) {
      return {
        status: 'invalid-token',
        transportReference: null,
        detail: 'Legacy Expo push token',
      };
    }

    try {
      if (!this.app) {
        const json = this.config
          .get<string>('FCM_SERVICE_ACCOUNT_JSON')
          ?.trim();
        if (!json) {
          return {
            status: 'permanent-failure',
            transportReference: null,
            detail: 'FCM_SERVICE_ACCOUNT_JSON is not configured',
          };
        }
        // Lazy initialization keeps development/tests without push credentials usable.
        // App-scoped Messaging avoids changing any other Firebase integration.
        const parsed: unknown = JSON.parse(json);
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Invalid Firebase service account');
        }
        const account = parsed as Record<string, unknown>;
        const projectId = account.project_id;
        const clientEmail = account.client_email;
        const privateKey = account.private_key;
        if (
          typeof projectId !== 'string' ||
          typeof clientEmail !== 'string' ||
          typeof privateKey !== 'string'
        ) {
          throw new Error('Invalid Firebase service account');
        }
        this.app = initializeApp(
          { credential: cert({ projectId, clientEmail, privateKey }) },
          'irtaki-push',
        );
      }

      const messageId = await this.withTimeout(
        getMessaging(this.app).send({
          token,
          data: {
            eventType: payload.eventType,
            resourceId: payload.resourceId,
          },
          notification: { ...FCM_NOTIFICATION },
          android: {
            priority: 'high',
            notification: { channelId: 'irtaki', sound: 'default' },
          },
          apns: {
            headers: { 'apns-push-type': 'alert', 'apns-priority': '10' },
            payload: { aps: { sound: 'default' } },
          },
        }),
      );
      // FCM acceptance is a handoff, not proof that the device displayed it.
      return { status: 'sent', transportReference: messageId };
    } catch (error: unknown) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'fcm/unknown-error';
      return {
        status: INVALID_TOKEN_ERRORS.has(code)
          ? 'invalid-token'
          : TRANSIENT_ERRORS.has(code)
            ? 'transient-failure'
            : 'permanent-failure',
        transportReference: null,
        // Provider messages can contain credentials or device tokens: log codes only.
        detail: code,
      };
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Object.assign(new Error('FCM timeout'), {
                  code: 'app/network-timeout',
                }),
              ),
            10_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.app) {
      await deleteApp(this.app);
      this.app = undefined;
    }
  }
}
