/* eslint-disable @typescript-eslint/unbound-method */
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { IMembershipPerformanceScope } from '../../domain/membership-performance-scope.interface';
import { MembershipPerformanceScopeGuard } from './membership-performance-scope.guard';

describe('MembershipPerformanceScopeGuard (API-039, TS §15.2)', () => {
  let guard: MembershipPerformanceScopeGuard;
  let scope: jest.Mocked<IMembershipPerformanceScope>;

  const membershipId = '01912f4e-6c1a-7b3c-9d5e-1f2a3b4c5d6e';
  const teacherId = 'teacher-1';
  const studentId = 'student-1';

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
      isActiveMembershipOfTeacher: jest.fn(),
      isOwnActiveMembership: jest.fn(),
    };
    guard = new MembershipPerformanceScopeGuard(scope);
  });

  it('throws 404 NOT_FOUND on a malformed id before any lookup (APIS §9.6)', async () => {
    const ctx = mockContext(
      { id: 'not-a-uuid' },
      { id: teacherId, role: UserRole.Teacher },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    expect(scope.isActiveMembershipOfTeacher).not.toHaveBeenCalled();
    expect(scope.isOwnActiveMembership).not.toHaveBeenCalled();
  });

  it('throws 404 NOT_FOUND when the path carries no id at all', async () => {
    const ctx = mockContext({}, { id: teacherId, role: UserRole.Teacher });

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('lets the Admin through without a lookup (DEC-C07)', async () => {
    const ctx = mockContext(
      { id: membershipId },
      { id: 'admin-1', role: UserRole.Admin },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(scope.isActiveMembershipOfTeacher).not.toHaveBeenCalled();
    expect(scope.isOwnActiveMembership).not.toHaveBeenCalled();
  });

  it('resolves the assigned Teacher with ONE indexed lookup (TS §15.2)', async () => {
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

  it('masks an out-of-scope, Terminated or non-existent membership as 403 for a Teacher (NFR-20)', async () => {
    scope.isActiveMembershipOfTeacher.mockResolvedValue(false);
    const ctx = mockContext(
      { id: membershipId },
      { id: teacherId, role: UserRole.Teacher },
    );

    await expectScopeDenied(ctx);
  });

  it('resolves the Student on their OWN membership (APIS §6.1 ✓ own)', async () => {
    scope.isOwnActiveMembership.mockResolvedValue(true);
    const ctx = mockContext(
      { id: membershipId },
      { id: studentId, role: UserRole.Student },
    );

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(scope.isOwnActiveMembership).toHaveBeenCalledWith(
      membershipId,
      studentId,
    );
    expect(scope.isActiveMembershipOfTeacher).not.toHaveBeenCalled();
  });

  it('masks another student’s membership as the SAME 403 (NFR-20)', async () => {
    scope.isOwnActiveMembership.mockResolvedValue(false);
    const ctx = mockContext(
      { id: membershipId },
      { id: studentId, role: UserRole.Student },
    );

    await expectScopeDenied(ctx);
  });

  it('denies every other role that reaches it, Assistant included (DEC-B09 defence in depth)', async () => {
    for (const role of [UserRole.Assistant, UserRole.User]) {
      const ctx = mockContext({ id: membershipId }, { id: 'x', role });
      await expectScopeDenied(ctx);
    }
    expect(scope.isActiveMembershipOfTeacher).not.toHaveBeenCalled();
    expect(scope.isOwnActiveMembership).not.toHaveBeenCalled();
  });

  it('denies an unauthenticated request that somehow reaches it', async () => {
    await expectScopeDenied(mockContext({ id: membershipId }));
  });
});
