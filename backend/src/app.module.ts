import {
  HttpStatus,
  MiddlewareConsumer,
  Module,
  NestModule,
  UnprocessableEntityException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate, EnvironmentVariables } from './config/app.config';
import { buildThrottlerOptions } from './config/rate-limit.config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { GroupsModule } from './modules/groups/groups.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProgressModule } from './modules/progress/progress.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CorrelationIdMiddleware, SharedModule } from './shared';

interface ValidationDetail {
  field: string;
  rule: string;
  message: string;
}

/**
 * APIS §9.5 `details[]` from class-validator's error tree. Nested DTOs
 * (e.g. `memo_range.from.surah`) report under their ROOT property so the
 * client can attach the message to the originating form field (TS §29).
 * The whitelist rejection (`forbidNonWhitelisted`) is re-worded in Arabic —
 * every user-facing message is Arabic (API-X06).
 */
function flattenValidationErrors(
  errors: ValidationError[],
  root?: string,
): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = root ?? error.property;
    const own = Object.entries(error.constraints ?? {}).map(
      ([rule, message]) => ({
        field,
        rule,
        message:
          rule === 'whitelistValidation'
            ? `الحقل ${error.property} غير مسموح به`
            : message,
      }),
    );
    const nested =
      error.children && error.children.length > 0
        ? flattenValidationErrors(error.children, field)
        : [];
    return [...own, ...nested];
  });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    // APIS §9.8 / NFR-22: two named throttlers, applied per route by
    // RateLimitGuard — never globally, since `/auth/*` and
    // `POST /join-requests` are the whole throttled surface for MVP.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        buildThrottlerOptions({
          authPerWindow: config.get('RATE_LIMIT_AUTH_PER_MINUTE', {
            infer: true,
          }),
          joinRequestsPerWindow: config.get(
            'RATE_LIMIT_JOIN_REQUESTS_PER_MINUTE',
            { infer: true },
          ),
        }),
    }),
    // ADR-024: in-process cron, registered once; jobs live in their modules.
    ScheduleModule.forRoot(),
    SharedModule,
    DatabaseModule,
    HealthModule,
    IdentityModule,
    GroupsModule,
    EnrollmentModule,
    MembershipsModule,
    ProgressModule,
    ReportsModule,
    AdministrationModule,
    NotificationsModule,
    PaymentsModule,
    PerformanceModule,
    // Last: API-009 composes the modules above and is imported by none of
    // them (TS §12 — a cross-module orchestrator with no owning module).
    DashboardModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        exceptionFactory: (errors) => {
          const details = flattenValidationErrors(errors);
          return new UnprocessableEntityException({
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            error: 'VALIDATION_ERROR',
            message: 'فشل التحقق من صحة البيانات المدخلة',
            details,
          });
        },
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
