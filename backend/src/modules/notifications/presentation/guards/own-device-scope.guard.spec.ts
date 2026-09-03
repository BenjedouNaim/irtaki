/* eslint-disable @typescript-eslint/unbound-method */
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IDeviceTokenScope } from '../../domain/device-token-scope.interface';
import { OwnDeviceScopeGuard } from './own-device-scope.guard';

describe('OwnDeviceScopeGuard (API-049 own scope, SA §14 / TS §15.2)', () => {
  let guard: OwnDeviceScopeGuard;
  let scope: jest.Mocked<IDeviceTokenScope>;

  const deviceId = '0191e6d2-2a5c-7b3e-9c1f-2f6a3c4d5e6f';

  function contextFor(
    params: { id?: string } | undefined,
    user: { id: string; role: string } | undefined,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ params, user }) }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    scope = { isOwnedByCaller: jest.fn() };
    guard = new OwnDeviceScopeGuard(scope);
  });

  it.each(['Student', 'Teacher', 'Assistant', 'Admin', 'User'])(
    'passes the owning %s after one scope lookup (API-048/049 are Any/Own)',
    async (role) => {
      scope.isOwnedByCaller.mockResolvedValue(true);

      await expect(
        guard.canActivate(contextFor({ id: deviceId }, { id: 'user-1', role })),
      ).resolves.toBe(true);
      expect(scope.isOwnedByCaller).toHaveBeenCalledWith(deviceId, 'user-1');
      expect(scope.isOwnedByCaller).toHaveBeenCalledTimes(1);
    },
  );

  it('answers the uniform 403 SCOPE_DENIED for another user’s device (NFR-20)', async () => {
    scope.isOwnedByCaller.mockResolvedValue(false);

    await expect(
      guard.canActivate(
        contextFor({ id: deviceId }, { id: 'user-2', role: 'Student' }),
      ),
    ).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { statusCode: 403, error: 'SCOPE_DENIED' },
    });
  });

  it('answers the same 403 for a well-formed id that does not exist (no enumeration)', async () => {
    scope.isOwnedByCaller.mockResolvedValue(false);

    await expect(
      guard.canActivate(
        contextFor(
          { id: '0191e6d2-2a5c-7b3e-9c1f-ffffffffffff' },
          { id: 'user-1', role: 'Admin' },
        ),
      ),
    ).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { statusCode: 403, error: 'SCOPE_DENIED' },
    });
  });

  it.each(['not-a-uuid', '', '123', undefined])(
    'answers 404 NOT_FOUND for a malformed id (%p) without querying (APIS §9.6)',
    async (id) => {
      await expect(
        guard.canActivate(
          contextFor({ id }, { id: 'user-1', role: 'Student' }),
        ),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        response: { statusCode: 404, error: 'NOT_FOUND' },
      });
      expect(scope.isOwnedByCaller).not.toHaveBeenCalled();
    },
  );

  it('denies a request that carries no authenticated user (defense in depth)', async () => {
    await expect(
      guard.canActivate(contextFor({ id: deviceId }, undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(scope.isOwnedByCaller).not.toHaveBeenCalled();
  });
});
