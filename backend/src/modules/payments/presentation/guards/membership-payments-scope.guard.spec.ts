/* eslint-disable @typescript-eslint/unbound-method */
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { IMembershipPaymentScope } from '../../domain/membership-payment-scope.interface';
import { MembershipPaymentsScopeGuard } from './membership-payments-scope.guard';

describe('MembershipPaymentsScopeGuard (API-047, TS §15.2, VR-27)', () => {
  let guard: MembershipPaymentsScopeGuard;
  let scope: jest.Mocked<IMembershipPaymentScope>;

  const membershipId = '01912f4e-6c1a-7b3c-9d5e-1f2a3b4c5d6e';
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
      isActiveMembershipOfAssistant: jest.fn(),
    };
    guard = new MembershipPaymentsScopeGuard(scope);
  });

  it('throws 404 NOT_FOUND on a malformed id before any lookup (APIS §9.6)', async () => {
    const ctx = mockContext(
      { id: 'not-a-uuid' },
      { id: assistantId, role: UserRole.Assistant },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    expect(scope.isActiveMembershipOfAssistant).not.toHaveBeenCalled();
  });

  it('lets an Assistant through after ONE lookup on (membership id, caller id)', async () => {
    scope.isActiveMembershipOfAssistant.mockResolvedValue(true);
    const ctx = mockContext(
      { id: membershipId },
      { id: assistantId, role: UserRole.Assistant },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(scope.isActiveMembershipOfAssistant).toHaveBeenCalledTimes(1);
    expect(scope.isActiveMembershipOfAssistant).toHaveBeenCalledWith(
      membershipId,
      assistantId,
    );
  });

  it('throws the uniform 403 SCOPE_DENIED with an Arabic message when the lookup finds nothing (SA §14 / NFR-20)', async () => {
    scope.isActiveMembershipOfAssistant.mockResolvedValue(false);
    const ctx = mockContext(
      { id: membershipId },
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

  it('throws 403 SCOPE_DENIED for the Admin, without a lookup — BR-34 makes the Assistant the only actor on this write, so there is no DEC-C07 bypass here', async () => {
    const ctx = mockContext(
      { id: membershipId },
      { id: 'admin-1', role: UserRole.Admin },
    );

    await expectScopeDenied(ctx);
    expect(scope.isActiveMembershipOfAssistant).not.toHaveBeenCalled();
  });

  it('throws 403 SCOPE_DENIED for a Teacher that somehow reaches the guard, without a lookup — SRS §10 excludes the Teacher from Payments unconditionally, the inverse of DEC-B09', async () => {
    const ctx = mockContext(
      { id: membershipId },
      { id: 'teacher-1', role: UserRole.Teacher },
    );

    await expectScopeDenied(ctx);
    expect(scope.isActiveMembershipOfAssistant).not.toHaveBeenCalled();
  });

  it.each([UserRole.Student, UserRole.User])(
    'throws 403 SCOPE_DENIED for a %s that somehow reaches the guard, without a lookup (defense in depth)',
    async (role) => {
      const ctx = mockContext({ id: membershipId }, { id: 'someone', role });

      await expectScopeDenied(ctx);
      expect(scope.isActiveMembershipOfAssistant).not.toHaveBeenCalled();
    },
  );

  it('throws 403 when no authenticated user is on the request', async () => {
    await expectScopeDenied(mockContext({ id: membershipId }));
  });
});
