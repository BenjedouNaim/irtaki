/* eslint-disable @typescript-eslint/unbound-method */
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { IMembershipReportScope } from '../../domain/membership-report-scope.interface';
import { MembershipDailyReportsScopeGuard } from './membership-daily-reports-scope.guard';

describe('MembershipDailyReportsScopeGuard (API-032, TS §15.2)', () => {
  let guard: MembershipDailyReportsScopeGuard;
  let scope: jest.Mocked<IMembershipReportScope>;

  const membershipId = '01912f4e-6c1a-7b3c-9d5e-1f2a3b4c5d6e';
  const teacherId = 'teacher-1';

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
    scope = { isActiveMembershipOfTeacher: jest.fn() };
    guard = new MembershipDailyReportsScopeGuard(scope);
  });

  it('throws 404 NOT_FOUND on a malformed id before any lookup (APIS §9.6)', async () => {
    const ctx = mockContext(
      { id: 'not-a-uuid' },
      { id: teacherId, role: UserRole.Teacher },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    expect(scope.isActiveMembershipOfTeacher).not.toHaveBeenCalled();
  });

  it('lets the Admin through without a lookup (DEC-C07)', async () => {
    const ctx = mockContext(
      { id: membershipId },
      { id: 'admin-1', role: UserRole.Admin },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(scope.isActiveMembershipOfTeacher).not.toHaveBeenCalled();
  });

  it('lets a Teacher through after ONE lookup on (membership id, caller id)', async () => {
    scope.isActiveMembershipOfTeacher.mockResolvedValue(true);
    const ctx = mockContext(
      { id: membershipId },
      { id: teacherId, role: UserRole.Teacher },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(scope.isActiveMembershipOfTeacher).toHaveBeenCalledTimes(1);
    expect(scope.isActiveMembershipOfTeacher).toHaveBeenCalledWith(
      membershipId,
      teacherId,
    );
  });

  it('throws the uniform 403 SCOPE_DENIED with an Arabic message when the lookup finds nothing (SA §14 / NFR-20)', async () => {
    scope.isActiveMembershipOfTeacher.mockResolvedValue(false);
    const ctx = mockContext(
      { id: membershipId },
      { id: teacherId, role: UserRole.Teacher },
    );

    await expectScopeDenied(ctx);
    const error: unknown = await guard
      .canActivate(ctx)
      .catch((e: unknown) => e);
    const response = (error as ForbiddenException).getResponse() as {
      message: string;
    };
    expect(response.message).toMatch(/[\u0600-\u06FF]/);
  });

  it.each([UserRole.Assistant, UserRole.Student, UserRole.User])(
    'throws 403 SCOPE_DENIED for a %s that somehow reaches the guard, without a lookup (defense in depth)',
    async (role) => {
      const ctx = mockContext({ id: membershipId }, { id: 'someone', role });

      await expectScopeDenied(ctx);
      expect(scope.isActiveMembershipOfTeacher).not.toHaveBeenCalled();
    },
  );

  it('throws 403 when no authenticated user is on the request', async () => {
    await expectScopeDenied(mockContext({ id: membershipId }));
  });
});
