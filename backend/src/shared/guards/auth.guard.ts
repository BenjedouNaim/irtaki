import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly accessSecret: string;

  constructor(
    protected readonly reflector?: Reflector,
    private readonly jwtService?: JwtService,
    private readonly configService?: ConfigService,
  ) {
    this.accessSecret =
      this.configService?.get<string>('JWT_ACCESS_SECRET') ||
      process.env.JWT_ACCESS_SECRET ||
      'dev-secret-key-must-be-changed-in-prod-min-32-chars';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (isPublic) {
        return true;
      }
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'TOKEN_EXPIRED',
        message: 'انتهت صلاحية الجلسة أو الرمز غير صالح',
      });
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'TOKEN_EXPIRED',
        message: 'انتهت صلاحية الجلسة أو الرمز غير صالح',
      });
    }

    try {
      if (this.jwtService) {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
          secret: this.accessSecret,
        });
        request.user = {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
        };
      }
      return true;
    } catch {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'TOKEN_EXPIRED',
        message: 'انتهت صلاحية الجلسة أو الرمز غير صالح',
      });
    }
  }
}
