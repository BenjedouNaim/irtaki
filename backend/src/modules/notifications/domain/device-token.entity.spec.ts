import { DeviceToken, DEVICE_PLATFORMS } from './device-token.entity';
import { DeviceTokenValidationError } from './device-token.errors';

describe('DeviceToken (E-09)', () => {
  const userId = 'user-1';

  it.each([...DEVICE_PLATFORMS])(
    'accepts the DBT-14 platform %s',
    (platform) => {
      const device = DeviceToken.register({
        userId,
        token: 'ExponentPushToken[abc]',
        platform,
      });

      expect(device.userId).toBe(userId);
      expect(device.token).toBe('ExponentPushToken[abc]');
      expect(device.platform).toBe(platform);
    },
  );

  it('trims the surrounding whitespace off the token', () => {
    const device = DeviceToken.register({
      userId,
      token: '  ExponentPushToken[abc]  ',
      platform: 'iOS',
    });

    expect(device.token).toBe('ExponentPushToken[abc]');
  });

  it('is frozen — a registration is a value, never mutated', () => {
    const device = DeviceToken.register({
      userId,
      token: 'token-1',
      platform: 'Android',
    });

    expect(Object.isFrozen(device)).toBe(true);
  });

  it('rejects a platform outside the DBT-14 CHECK values', () => {
    expect(() =>
      DeviceToken.register({ userId, token: 'token-1', platform: 'Web' }),
    ).toThrow(DeviceTokenValidationError);

    try {
      DeviceToken.register({ userId, token: 'token-1', platform: 'Web' });
    } catch (error) {
      expect(error).toBeInstanceOf(DeviceTokenValidationError);
      expect((error as DeviceTokenValidationError).details).toEqual([
        expect.objectContaining({ field: 'platform' }),
      ]);
    }
  });

  it('rejects a platform whose casing does not match (android)', () => {
    expect(() =>
      DeviceToken.register({ userId, token: 'token-1', platform: 'android' }),
    ).toThrow(DeviceTokenValidationError);
  });

  it.each(['', '   '])('rejects the blank token %p', (token) => {
    expect(() =>
      DeviceToken.register({ userId, token, platform: 'iOS' }),
    ).toThrow(DeviceTokenValidationError);
  });

  it('reports every broken rule at once', () => {
    try {
      DeviceToken.register({ userId, token: '  ', platform: 'Web' });
      fail('expected DeviceTokenValidationError');
    } catch (error) {
      const details = (error as DeviceTokenValidationError).details;
      expect(details.map((d) => d.field)).toEqual(['token', 'platform']);
    }
  });
});
