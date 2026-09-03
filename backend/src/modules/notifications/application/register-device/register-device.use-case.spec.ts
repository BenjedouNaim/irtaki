/* eslint-disable @typescript-eslint/unbound-method */
import { UnprocessableEntityException } from '@nestjs/common';
import { DeviceToken } from '../../domain/device-token.entity';
import {
  DeviceTokenRecord,
  IDeviceTokenRepository,
} from '../../domain/device-token.repository.interface';
import { RegisterDeviceUseCase } from './register-device.use-case';

describe('RegisterDeviceUseCase (F-NOT-01 / API-048)', () => {
  let useCase: RegisterDeviceUseCase;
  let repository: jest.Mocked<IDeviceTokenRepository>;

  const userId = 'user-1';

  const record: DeviceTokenRecord = {
    id: '0192f0c1-0000-7000-8000-000000000001',
    token: 'ExponentPushToken[abc]',
    platform: 'iOS',
    registeredAt: '2026-09-01T08:00:00.000Z',
    lastSeenAt: '2026-09-03T08:00:00.000Z',
    invalidatedAt: null,
  };

  beforeEach(() => {
    repository = {
      registerOrRefresh: jest.fn(),
      deletePhysically: jest.fn(),
    };
    useCase = new RegisterDeviceUseCase(repository);
  });

  it('returns the APIS §9.1 envelope with the DeviceTokenDto', async () => {
    repository.registerOrRefresh.mockResolvedValue(record);

    const result = await useCase.execute(userId, {
      token: 'ExponentPushToken[abc]',
      platform: 'iOS',
    });

    expect(result).toEqual({
      data: {
        id: record.id,
        token: 'ExponentPushToken[abc]',
        platform: 'iOS',
        registered_at: '2026-09-01T08:00:00.000Z',
        last_seen_at: '2026-09-03T08:00:00.000Z',
        invalidated_at: null,
      },
    });
  });

  it('hands the repository an E-09 entity carrying the JWT caller, never a body user_id', async () => {
    repository.registerOrRefresh.mockResolvedValue(record);

    await useCase.execute(userId, {
      token: '  ExponentPushToken[abc]  ',
      platform: 'iOS',
    });

    const passed = repository.registerOrRefresh.mock.calls[0][0];
    expect(passed).toBeInstanceOf(DeviceToken);
    expect(passed.userId).toBe(userId);
    expect(passed.token).toBe('ExponentPushToken[abc]');
    expect(passed.platform).toBe('iOS');
  });

  it('performs exactly one idempotent upsert per call (VR-29 — no read-then-write)', async () => {
    repository.registerOrRefresh.mockResolvedValue(record);

    await useCase.execute(userId, { token: 'token-1', platform: 'Android' });

    expect(repository.registerOrRefresh).toHaveBeenCalledTimes(1);
  });

  it('maps the domain rejection to 422 with field-level details (TS §21)', async () => {
    await expect(
      useCase.execute(userId, {
        token: '   ',
        platform: 'iOS',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(repository.registerOrRefresh).not.toHaveBeenCalled();
  });

  it('surfaces the domain details array on the 422 response body', async () => {
    try {
      await useCase.execute(userId, {
        token: 'token-1',
        // The DTO layer normally blocks this; the domain layer is the
        // second of TS §21's four layers and must reject it on its own.
        platform: 'Web' as 'iOS',
      });
      fail('expected UnprocessableEntityException');
    } catch (error) {
      const body = (
        error as UnprocessableEntityException
      ).getResponse() as Record<string, unknown>;
      expect(body.statusCode).toBe(422);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual([
        expect.objectContaining({ field: 'platform' }),
      ]);
    }
  });
});
