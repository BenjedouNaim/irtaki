import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDeviceDto } from './register-device.dto';

/** Mirrors app.module's ValidationPipe options (whitelist + forbidNonWhitelisted). */
async function fields(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(RegisterDeviceDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property);
}

describe('RegisterDeviceDto (transport layer, APIS §10.12)', () => {
  it.each(['iOS', 'Android'])(
    'accepts the %s body APIS §10.12 spells',
    async (platform) => {
      expect(
        await fields({ token: 'ExponentPushToken[abc]', platform }),
      ).toEqual([]);
    },
  );

  it('rejects a platform outside the two documented values', async () => {
    expect(
      await fields({ token: 'ExponentPushToken[abc]', platform: 'Web' }),
    ).toEqual(['platform']);
  });

  it('rejects a lowercased platform — the contract is case-exact', async () => {
    expect(
      await fields({ token: 'ExponentPushToken[abc]', platform: 'ios' }),
    ).toEqual(['platform']);
  });

  it.each([undefined, '', null])('rejects the token %p', async (token) => {
    expect(await fields({ token, platform: 'iOS' })).toEqual(['token']);
  });

  it('strips a mass-assigned user_id (allow-list DTO, AGENTS §11)', async () => {
    expect(
      await fields({
        token: 'ExponentPushToken[abc]',
        platform: 'iOS',
        user_id: 'somebody-else',
      }),
    ).toEqual(['user_id']);
  });
});
