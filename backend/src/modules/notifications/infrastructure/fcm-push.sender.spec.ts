import { ConfigService } from '@nestjs/config';
import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { buildPushPayload } from '../domain/push-payload';
import { FcmPushSender, FCM_NOTIFICATION } from './fcm-push.sender';

jest.mock('firebase-admin/app', () => ({
  cert: jest.fn().mockReturnValue('credential'),
  initializeApp: jest.fn().mockReturnValue({ name: 'irtaki-push' }),
  deleteApp: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: jest.fn() }));

describe('FcmPushSender', () => {
  const send = jest.fn();
  const payload = buildPushPayload({
    eventType: 'N-01',
    resourceId: 'membership-1',
  });
  const serviceAccount = {
    project_id: 'irtaki',
    client_email: 'push@example.test',
    private_key: 'private',
  };
  let sender: FcmPushSender;

  beforeEach(() => {
    jest.clearAllMocks();
    send.mockReset().mockResolvedValue('projects/irtaki/messages/1');
    jest
      .mocked(getMessaging)
      .mockReturnValue({ send } as unknown as ReturnType<typeof getMessaging>);
    sender = new FcmPushSender({
      get: () => JSON.stringify(serviceAccount),
    } as unknown as ConfigService);
  });

  afterEach(async () => {
    await sender.onModuleDestroy();
  });

  it('uses the service account and sends only generic text plus the two allow-listed data fields', async () => {
    const result = await sender.send('native-token', {
      ...payload,
      name: 'PRIVATE',
      amount: 30,
    } as typeof payload);
    expect(cert).toHaveBeenCalledWith({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    });
    expect(initializeApp).toHaveBeenCalledWith(
      { credential: 'credential' },
      'irtaki-push',
    );
    expect(send).toHaveBeenCalledWith({
      token: 'native-token',
      data: payload,
      notification: FCM_NOTIFICATION,
      android: {
        priority: 'high',
        notification: { channelId: 'irtaki', sound: 'default' },
      },
      apns: {
        headers: { 'apns-push-type': 'alert', 'apns-priority': '10' },
        payload: { aps: { sound: 'default' } },
      },
    });
    expect(result).toEqual({
      status: 'sent',
      transportReference: 'projects/irtaki/messages/1',
    });
    await sender.send('second-token', payload);
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });

  it.each([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
  ])('invalidates only definitively invalid tokens: %s', async (code) => {
    send.mockRejectedValue({ code, message: 'secret token and credential' });
    expect(await sender.send('native-token', payload)).toEqual({
      status: 'invalid-token',
      transportReference: null,
      detail: code,
    });
  });

  it.each([
    'messaging/server-unavailable',
    'messaging/internal-error',
    'app/network-error',
    'app/network-timeout',
  ])('allows an application retry for %s', async (code) => {
    send.mockRejectedValue({ code });
    expect((await sender.send('native-token', payload)).status).toBe(
      'transient-failure',
    );
  });

  it.each([
    'messaging/authentication-error',
    'messaging/mismatched-credential',
    'messaging/invalid-apns-credentials',
    'messaging/invalid-argument',
    'messaging/message-rate-exceeded',
  ])(
    'does not invalidate devices or immediately retry configuration/payload/rate errors: %s',
    async (code) => {
      send.mockRejectedValue({ code, message: 'private key' });
      expect(await sender.send('native-token', payload)).toEqual({
        status: 'permanent-failure',
        transportReference: null,
        detail: code,
      });
    },
  );

  it('handles missing and malformed credentials without network requests or leaking their contents', async () => {
    for (const value of [undefined, '', 'PRIVATE_INVALID_JSON']) {
      const unconfigured = new FcmPushSender({
        get: () => value,
      } as unknown as ConfigService);
      const result = await unconfigured.send('native-token', payload);
      expect(result.status).toBe('permanent-failure');
      expect(JSON.stringify(result)).not.toContain('PRIVATE_INVALID_JSON');
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('retires legacy Expo tokens without sending them to Firebase', async () => {
    expect((await sender.send('ExponentPushToken[old]', payload)).status).toBe(
      'invalid-token',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('deletes its Firebase app on shutdown', async () => {
    await sender.send('native-token', payload);
    await sender.onModuleDestroy();
    expect(deleteApp).toHaveBeenCalledWith({ name: 'irtaki-push' });
  });

  it('bounds the time spent waiting for Firebase', async () => {
    jest.useFakeTimers();
    try {
      send.mockReturnValue(new Promise(() => {}));
      const result = sender.send('native-token', payload);
      await jest.advanceTimersByTimeAsync(10_000);
      expect(await result).toEqual({
        status: 'transient-failure',
        transportReference: null,
        detail: 'app/network-timeout',
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
