/* eslint-disable @typescript-eslint/unbound-method */
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IWeeklyReportScope } from '../../domain/weekly-report-scope.interface';
import { OwnWeeklyReportScopeGuard } from './own-weekly-report-scope.guard';

describe('OwnWeeklyReportScopeGuard (API-034 own scope, SA §14 / TS §15.2)', () => {
  let guard: OwnWeeklyReportScopeGuard;
  let scope: jest.Mocked<IWeeklyReportScope>;

  const reportId = '0191e6d2-2a5c-7b3e-9c1f-2f6a3c4d5e6f';

  function contextFor(
    params: { id?: string } | undefined,
    user: { id: string; role: string } | undefined,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ params, user }) }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    scope = { isOwnedByStudent: jest.fn() };
    guard = new OwnWeeklyReportScopeGuard(scope);
  });

  it('passes the owning student after one scope lookup', async () => {
    scope.isOwnedByStudent.mockResolvedValue(true);

    await expect(
      guard.canActivate(
        contextFor({ id: reportId }, { id: 'student-1', role: 'Student' }),
      ),
    ).resolves.toBe(true);
    expect(scope.isOwnedByStudent).toHaveBeenCalledWith(reportId, 'student-1');
    expect(scope.isOwnedByStudent).toHaveBeenCalledTimes(1);
  });

  it('answers the uniform 403 SCOPE_DENIED when the lookup finds nothing (NFR-20)', async () => {
    scope.isOwnedByStudent.mockResolvedValue(false);

    await expect(
      guard.canActivate(
        contextFor({ id: reportId }, { id: 'student-2', role: 'Student' }),
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
          contextFor({ id }, { id: 'student-1', role: 'Student' }),
        ),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        response: { statusCode: 404, error: 'NOT_FOUND' },
      });
      expect(scope.isOwnedByStudent).not.toHaveBeenCalled();
    },
  );

  it('denies a request that carries no authenticated user (defense in depth)', async () => {
    await expect(
      guard.canActivate(contextFor({ id: reportId }, undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(scope.isOwnedByStudent).not.toHaveBeenCalled();
  });
});
