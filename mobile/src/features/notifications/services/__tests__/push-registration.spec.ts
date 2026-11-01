import {
  PushRegistrationManager,
  type PushRegistrationAdapter,
} from '../push-registration';

describe('native push registration lifecycle', () => {
  const alice = { userId: 'alice', accessToken: 'alice-jwt' };
  const bob = { userId: 'bob', accessToken: 'bob-jwt' };
  let adapter: jest.Mocked<PushRegistrationAdapter>;
  let manager: PushRegistrationManager;

  beforeEach(() => {
    adapter = {
      permission: jest.fn().mockResolvedValue(true),
      enable: jest.fn().mockResolvedValue(undefined),
      token: jest.fn().mockResolvedValue('native-token'),
      deleteToken: jest.fn().mockResolvedValue(undefined),
      register: jest.fn().mockResolvedValue({ id: 'device-1' }),
      unregister: jest.fn().mockResolvedValue(undefined),
      load: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    manager = new PushRegistrationManager(adapter);
  });

  it('registers native tokens for the authenticated owner and persists the unregister id', async () => {
    await manager.sync(alice);
    expect(adapter.register).toHaveBeenCalledWith('native-token', 'alice-jwt');
    expect(adapter.save).toHaveBeenLastCalledWith({
      userId: 'alice',
      deviceId: 'device-1',
    });
  });

  it('never registers a denied permission or signed-out session', async () => {
    adapter.permission.mockResolvedValue(false);
    await manager.sync(alice);
    await manager.sync(null);
    expect(adapter.register).not.toHaveBeenCalled();
    expect(adapter.enable).toHaveBeenLastCalledWith(false);
    expect(adapter.deleteToken).toHaveBeenCalled();
  });

  it('removes the old account using its own credentials before registering the new account', async () => {
    await manager.sync(alice);
    await manager.sync(bob);
    expect(adapter.unregister).toHaveBeenCalledWith('device-1', 'alice-jwt');
    expect(adapter.register).toHaveBeenLastCalledWith(
      'native-token',
      'bob-jwt',
    );
    expect(adapter.deleteToken).toHaveBeenCalled();
  });

  it('cleans up a registration that finishes after logout was requested', async () => {
    let finish!: (value: { id: string }) => void;
    let started!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      started = resolve;
    });
    adapter.register.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const login = manager.sync(alice);
    await inFlight;
    const logout = manager.sync(null);
    finish({ id: 'late-device' });
    await Promise.all([login, logout]);
    expect(adapter.unregister).toHaveBeenCalledWith('late-device', 'alice-jwt');
    expect(adapter.save).toHaveBeenLastCalledWith(null);
    expect(adapter.enable).toHaveBeenLastCalledWith(false);
  });

  it('invalidates the native token even when server cleanup fails offline', async () => {
    await manager.sync(alice);
    adapter.unregister.mockRejectedValue(new Error('offline'));
    await expect(manager.sync(null)).resolves.toBeUndefined();
    expect(adapter.deleteToken).toHaveBeenCalled();
    expect(adapter.save).toHaveBeenLastCalledWith(null);
  });

  it('removes obsolete server rows after token rotation', async () => {
    await manager.sync(alice);
    adapter.token.mockResolvedValue('rotated-token');
    adapter.register.mockResolvedValue({ id: 'new-device' });
    await manager.sync(alice);
    expect(adapter.register).toHaveBeenLastCalledWith(
      'rotated-token',
      alice.accessToken,
    );
    expect(adapter.unregister).toHaveBeenCalledWith(
      'device-1',
      alice.accessToken,
    );
  });

  it('still invalidates the native token if secure storage fails during logout', async () => {
    await manager.sync(alice);
    adapter.save.mockRejectedValue(new Error('keychain unavailable'));
    await manager.sync(null);
    expect(adapter.enable).toHaveBeenLastCalledWith(false);
    expect(adapter.deleteToken).toHaveBeenCalled();
  });

  it('does not delete another user’s persisted registration with the new account’s JWT', async () => {
    adapter.load.mockResolvedValue({ userId: 'alice', deviceId: 'old-device' });
    await manager.sync(bob);
    expect(adapter.unregister).not.toHaveBeenCalled();
    expect(adapter.deleteToken).toHaveBeenCalled();
    expect(adapter.register).toHaveBeenCalledWith(
      'native-token',
      bob.accessToken,
    );
  });

  it('retries a failed registration on the next sync without blocking login', async () => {
    adapter.register.mockRejectedValueOnce(new Error('offline'));
    await expect(manager.sync(alice)).resolves.toBeUndefined();
    await manager.sync(alice);
    expect(adapter.register).toHaveBeenCalledTimes(2);
  });
});
