import { ConfigService } from '@nestjs/config';
import { buildPushPayload } from '../domain/push-payload';
import { ExpoPushSender } from './expo-push.sender';

describe('ExpoPushSender (EXT-03, ADR-020)', () => {
  const originalFetch = global.fetch;
  const payload = buildPushPayload({
    eventType: 'N-01',
    resourceId: 'membership-1',
  });
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  function sender(configured = true): ExpoPushSender {
    configService = {
      get: jest
        .fn()
        .mockReturnValue(configured ? '{"type":"service_account"}' : undefined),
    };
    return new ExpoPushSender(configService as unknown as ConfigService);
  }

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('reports a transient failure, never throws, when the transport is unconfigured', async () => {
    const result = await sender(false).send('ExponentPushToken[a]', payload);

    expect(result.status).toBe('transient-failure');
    expect(result.transportReference).toBeNull();
  });

  it('posts ONLY `to` and the two-field payload as `data` (BR-46)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { status: 'ok', id: 'ticket-1' } }),
    });

    const result = await sender().send('ExponentPushToken[a]', payload);

    expect(result).toEqual({
      status: 'sent',
      transportReference: 'ticket-1',
      detail: undefined,
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      { body: string },
    ];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['data', 'to']);
    // No title, no body — a locked-screen render must reveal nothing.
    expect(body.data).toEqual({
      eventType: 'N-01',
      resourceId: 'membership-1',
    });
  });

  it("maps Expo's DeviceNotRegistered to invalid-token, never a retry", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            status: 'error',
            message: 'not registered',
            details: { error: 'DeviceNotRegistered' },
          },
        }),
    });

    const result = await sender().send('ExponentPushToken[a]', payload);

    expect(result.status).toBe('invalid-token');
  });

  it('maps any other error ticket to a transient failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            status: 'error',
            message: 'MessageRateExceeded',
            details: { error: 'MessageRateExceeded' },
          },
        }),
    });

    const result = await sender().send('ExponentPushToken[a]', payload);

    expect(result.status).toBe('transient-failure');
    expect(result.detail).toBe('MessageRateExceeded');
  });

  it('maps a non-2xx response to a transient failure', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 502, json: () => ({}) });

    const result = await sender().send('ExponentPushToken[a]', payload);

    expect(result.status).toBe('transient-failure');
    expect(result.detail).toContain('502');
  });

  it('never throws when the network itself fails (BR-60, ADR-032)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      sender().send('ExponentPushToken[a]', payload),
    ).resolves.toEqual({
      status: 'transient-failure',
      transportReference: null,
      detail: 'ECONNREFUSED',
    });
  });
});
