import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DEVICE_TOKEN_REPOSITORY } from './domain/device-token.repository.interface';
import { DeviceTokenTypeOrmEntity } from './infrastructure/device-token.typeorm-entity';
import { DeviceTokenRepository } from './infrastructure/device-token.repository';
import { RegisterDeviceUseCase } from './application/register-device/register-device.use-case';
import { NotificationsController } from './presentation/notifications.controller';

/**
 * Notifications module (SA §11): owns `device_tokens`,
 * `notification_preferences` and `notification_log`. It is a leaf on the
 * dependency graph — it subscribes to other modules' domain events and is
 * never called into directly (AGENTS §7), so it imports no other module.
 *
 * F-NOT-01 opens the `device_tokens` half: the E-09 repository and the
 * `RegisterDeviceUseCase` TS §13 names.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DeviceTokenTypeOrmEntity])],
  controllers: [NotificationsController],
  providers: [
    {
      provide: DEVICE_TOKEN_REPOSITORY,
      useClass: DeviceTokenRepository,
    },
    DeviceTokenRepository,
    RegisterDeviceUseCase,
  ],
  exports: [DEVICE_TOKEN_REPOSITORY, DeviceTokenRepository],
})
export class NotificationsModule {}
