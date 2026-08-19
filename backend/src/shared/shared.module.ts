import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { PinoLoggerService } from './logging/logger.service';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ScopeGuard } from './guards/scope.guard';

@Global()
@Module({
  providers: [
    PinoLoggerService,
    CorrelationIdMiddleware,
    AuthGuard,
    RolesGuard,
    ScopeGuard,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
  exports: [
    PinoLoggerService,
    CorrelationIdMiddleware,
    AuthGuard,
    RolesGuard,
    ScopeGuard,
  ],
})
export class SharedModule {}
