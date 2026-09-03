/* eslint-disable @typescript-eslint/unbound-method */
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { IGroupPaymentScope } from '../../domain/group-payment-scope.interface';
import { GroupPaymentsScopeGuard } from './group-payments-scope.guard';

describe('GroupPaymentsScopeGuard (API-046, TS §15.2)', () => {
  let guard: GroupPaymentsScopeGuard;
  let scope: jest.Mocked<IGroupPaymentScope>;

  const groupId = '01912f4e-6c1a-7b3c-9d5e-1f2a3b4c5d6e';
  const assistantId = 'assistant-1';

  function mockContext(
    params: { id?: string },
    user?: { id: string; role: string },
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ params, user }),
      }),
    } as unknown as ExecutionContext;
  }

  async function expectScopeDenied(ctx: ExecutionContext): Promise<void> {
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      response: { statusCode: 403, error: 'SCOPE_DENIED' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  }

  beforeEach(() => {
    scope = {
      isGroupOfAssistant: jest.fn(),
      groupExists: jest.fn(),
    };
    guard = new GroupPaymentsScopeGuard(scope);
  });

  it('throws 404 NOT_FOUND on a malformed id before any lookup (APIS §9.6)', async () => {
    const ctx = mockContext(
      { id: 'not-a-uuid' },
      { id: assistantId, role: UserRole.Assistant },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    expect(scope.isGroupOfAssistant).not.toHaveBeenCalled();
  });

  it('lets the Admin through without a lookup (DEC-C07)', async () => {
    const ctx = mockContext(
      { id: groupId },
      { id: 'admin-1', role: UserRole.Admin },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(scope.isGroupOfAssistant).not.toHaveBeenCalled();
  });

  it('lets an Assistant through after ONE lookup on (group id, caller id)', async () => {
    scope.isGroupOfAssistant.mockResolvedValue(true);
    const ctx = mockContext(
      { id: groupId },
      { id: assistantId, role: UserRole.Assistant },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(scope.isGroupOfAssistant).toHaveBeenCalledTimes(1);
    expect(scope.isGroupOfAssistant).toHaveBeenCalledWith(groupId, assistantId);
  });

  it('throws the uniform 403 SCOPE_DENIED with an Arabic message when the lookup finds nothing (SA §14 / NFR-20)', async () => {
    scope.isGroupOfAssistant.mockResolvedValue(false);
    const ctx = mockContext(
      { id: groupId },
      { id: assistantId, role: UserRole.Assistant },
    );

    await expectScopeDenied(ctx);
    const error: unknown = await guard
      .canActivate(ctx)
      .catch((e: unknown) => e);
    const response = (error as ForbiddenException).getResponse() as {
      message: string;
    };
    expect(response.message).toMatch(/[؀-ۿ]/);
  });

  it('throws 403 SCOPE_DENIED for a Teacher that somehow reaches the guard, without a lookup — SRS §10 excludes the Teacher from Payments unconditionally, the inverse of DEC-B09', async () => {
    const ctx = mockContext(
      { id: groupId },
      { id: 'teacher-1', role: UserRole.Teacher },
    );

    await expectScopeDenied(ctx);
    expect(scope.isGroupOfAssistant).not.toHaveBeenCalled();
  });

  it.each([UserRole.Student, UserRole.User])(
    'throws 403 SCOPE_DENIED for a %s that somehow reaches the guard, without a lookup (defense in depth)',
    async (role) => {
      const ctx = mockContext({ id: groupId }, { id: 'someone', role });

      await expectScopeDenied(ctx);
      expect(scope.isGroupOfAssistant).not.toHaveBeenCalled();
    },
  );

  it('throws 403 when no authenticated user is on the request', async () => {
    await expectScopeDenied(mockContext({ id: groupId }));
  });
});
