import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let reflector: Reflector;
  let jwtService: JwtService;
  let configService: ConfigService;

  const testHandler = () => {};
  class TestController {}

  const createMockContext = (
    authHeader?: string,
    reqTarget: Record<string, unknown> = {},
  ): { context: ExecutionContext; req: Record<string, unknown> } => {
    const req = {
      headers: {
        authorization: authHeader,
      },
      ...reqTarget,
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getHandler: () => testHandler,
      getClass: () => TestController,
    } as unknown as ExecutionContext;

    return { context, req };
  };

  beforeEach(() => {
    reflector = new Reflector();
    jwtService = new JwtService({});
    configService = new ConfigService({
      JWT_ACCESS_SECRET: 'test-jwt-secret-key-min-32-chars-long',
    });
    guard = new AuthGuard(reflector, jwtService, configService);
  });

  it('should bypass authentication when route is marked as @Public()', async () => {
    const reflectorSpy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(true);
    const { context, req } = createMockContext(undefined);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(reflectorSpy).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    expect(req.user).toBeUndefined();
  });

  it('should extract role, id (from sub), and email claims properly when token is valid', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const jwtSpy = jest.spyOn(jwtService, 'verifyAsync').mockResolvedValue({
      sub: 'usr_01JTEST1234567890ABCDEFGH',
      email: 'student@irtaki.tn',
      role: 'Student',
    });

    const { context, req } = createMockContext('Bearer valid-access-token');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtSpy).toHaveBeenCalledWith('valid-access-token', {
      secret: 'test-jwt-secret-key-min-32-chars-long',
    });
    expect(req.user).toEqual({
      id: 'usr_01JTEST1234567890ABCDEFGH',
      email: 'student@irtaki.tn',
      role: 'Student',
    });
  });

  it('should throw UnauthorizedException when Authorization header is missing', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when Authorization header does not start with Bearer', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext('Basic dXNlcjpwYXNz');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when Bearer token is empty', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext('Bearer ');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when jwt verification fails (expired or invalid)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jest
      .spyOn(jwtService, 'verifyAsync')
      .mockRejectedValue(new Error('jwt expired'));

    const { context } = createMockContext('Bearer expired-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
