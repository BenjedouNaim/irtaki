import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../../identity/domain/user-role.enum';
import { MembershipProgressScopeGuard } from './membership-progress-scope.guard';

describe('MembershipProgressScopeGuard (TS §15.2)', () => {
  let guard: MembershipProgressScopeGuard;
  let dataSource: jest.Mocked<Pick<DataSource, 'query'>>;

  const validMembershipId = '01912f4e-6c1a-7b3c-9d5e-1f2a3b4c5d6e';
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

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    guard = new MembershipProgressScopeGuard(
      dataSource as unknown as DataSource,
    );
  });

  it('throws 404 NOT_FOUND when the membership id is malformed (APIS §9.6)', async () => {
    const ctx = mockContext(
      { id: 'not-a-valid-uuid' },
      { id: teacherId, role: UserRole.Teacher },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('bypasses scope check for Admin by early-return true (DEC-C07)', async () => {
    const ctx = mockContext(
      { id: validMembershipId },
      { id: 'admin-1', role: UserRole.Admin },
    );

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns true when Teacher is assigned to the membership group (TS §15.2 single indexed query)', async () => {
    dataSource.query.mockResolvedValueOnce([{ exists: 1 }]);
    const ctx = mockContext(
      { id: validMembershipId },
      { id: teacherId, role: UserRole.Teacher },
    );

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE m.id = $1'),
      [validMembershipId, teacherId],
    );
  });

  it('throws uniform 403 SCOPE_DENIED when Teacher query returns 0 rows (out of scope or nonexistent — SA §14)', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    const ctx = mockContext(
      { id: validMembershipId },
      { id: teacherId, role: UserRole.Teacher },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws 403 for unauthorized roles reaching the guard', async () => {
    const ctx = mockContext(
      { id: validMembershipId },
      { id: 'student-1', role: UserRole.Student },
    );

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
