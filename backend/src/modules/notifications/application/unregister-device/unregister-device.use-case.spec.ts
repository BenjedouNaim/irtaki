/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException } from '@nestjs/common';
import { IDeviceTokenRepository } from '../../domain/device-token.repository.interface';
import { UnregisterDeviceUseCase } from './unregister-device.use-case';

describe('UnregisterDeviceUseCase (F-NOT-02 / API-049)', () => {
  let useCase: UnregisterDeviceUseCase;
  let repository: jest.Mocked<IDeviceTokenRepository>;

  const userId = 'user-1';
  const deviceId = '0192f0c1-0000-7000-8000-000000000001';

  beforeEach(() => {
    repository = {
      registerOrRefresh: jest.fn(),
      deletePhysically: jest.fn(),
    };
    useCase = new UnregisterDeviceUseCase(repository);
  });

  it('physically deletes the row scoped to the caller (DBD §25 hard-delete exception)', async () => {
    repository.deletePhysically.mockResolvedValue(true);

    await expect(useCase.execute(userId, deviceId)).resolves.toBeUndefined();

    expect(repository.deletePhysically).toHaveBeenCalledWith(deviceId, userId);
  });

  it('answers the uniform 403 SCOPE_DENIED when no row matched (NFR-20)', async () => {
    repository.deletePhysically.mockResolvedValue(false);

    await expect(useCase.execute(userId, deviceId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('never falls back to a soft delete — the repository has no such path', () => {
    expect(Object.keys(repository)).toEqual([
      'registerOrRefresh',
      'deletePhysically',
    ]);
  });
});
