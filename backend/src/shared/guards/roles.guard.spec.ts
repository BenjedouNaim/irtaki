import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard, ROLES_KEY } from './roles.guard';
import { UserRole } from '../../modules/identity/domain/user-role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const defaultHandler = () => {};
  class DefaultController {}

  const createMockContext = (
    user?: { id?: string; email?: string; role?: string } | null,
    handler = defaultHandler,
    cls = DefaultController,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
      getHandler: () => handler,
      getClass: () => cls,
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow access if reflector is not provided', () => {
    const unreflectedGuard = new RolesGuard(undefined);
    const context = createMockContext({ role: UserRole.User });

    expect(unreflectedGuard.canActivate(context)).toBe(true);
  });

  it('should allow access if no @Roles() metadata is set on handler or class', () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined);
    const context = createMockContext({ role: UserRole.User });

    expect(guard.canActivate(context)).toBe(true);
    expect(spy).toHaveBeenCalledWith(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });

  it('should allow access if @Roles() metadata is an empty array', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const context = createMockContext({ role: UserRole.User });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when caller role is included in requiredRoles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.Admin, UserRole.Teacher]);

    const context = createMockContext({
      id: 'teacher-123',
      email: 'teacher@test.com',
      role: UserRole.Teacher,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when caller role is not in requiredRoles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.Admin, UserRole.Teacher]);

    const context = createMockContext({
      id: 'student-123',
      email: 'student@test.com',
      role: UserRole.Student,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when request has no user', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.Admin]);

    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user has no role property', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.Admin]);

    const context = createMockContext({
      id: 'user-123',
      email: 'user@test.com',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
