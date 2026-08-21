import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopeGuard } from './scope.guard';

describe('ScopeGuard', () => {
  let guard: ScopeGuard;
  let reflector: Reflector;

  const mockContext = {
    switchToHttp: () => ({
      getRequest: () => ({}),
    }),
    getHandler: () => () => {},
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new ScopeGuard(reflector);
  });

  it('should return true unconditionally (skeleton pass-through contract)', () => {
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should return true even when initialized without Reflector', () => {
    const unreflectedGuard = new ScopeGuard();
    expect(unreflectedGuard.canActivate(mockContext)).toBe(true);
  });
});
