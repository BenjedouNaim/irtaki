import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { PinoLoggerService } from './logging/logger.service';
import { HealthchecksPingService } from './observability/healthchecks-ping.service';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ScopeGuard } from './guards/scope.guard';

@Global()
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [
    PinoLoggerService,
    HealthchecksPingService,
    CorrelationIdMiddleware,
    AuthGuard,
    RolesGuard,
    ScopeGuard,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ScopeGuard,
    },
  ],
  exports: [
    PinoLoggerService,
    HealthchecksPingService,
    CorrelationIdMiddleware,
    AuthGuard,
    RolesGuard,
    ScopeGuard,
  ],
})
export class SharedModule {}
