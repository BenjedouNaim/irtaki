import {
  HttpStatus,
  MiddlewareConsumer,
  Module,
  NestModule,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { GroupsModule } from './modules/groups/groups.module';
import { EnrollmentModule } from './modules/enrollment/enrollment.module';
import { CorrelationIdMiddleware, SharedModule } from './shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    SharedModule,
    DatabaseModule,
    HealthModule,
    IdentityModule,
    GroupsModule,
    EnrollmentModule,
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
          const details = errors.flatMap((error) => {
            if (!error.constraints) return [];
            return Object.entries(error.constraints).map(([rule, message]) => ({
              field: error.property,
              rule,
              message,
            }));
          });
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
