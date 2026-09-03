import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DEVICE_TOKEN_REPOSITORY } from './domain/device-token.repository.interface';
import { DEVICE_TOKEN_SCOPE } from './domain/device-token-scope.interface';
import { NOTIFICATION_PREFERENCE_REPOSITORY } from './domain/notification-preference.repository.interface';
import { DeviceTokenTypeOrmEntity } from './infrastructure/device-token.typeorm-entity';
import { DeviceTokenRepository } from './infrastructure/device-token.repository';
import { DeviceTokenScope } from './infrastructure/device-token-scope';
import { NotificationPreferenceRepository } from './infrastructure/notification-preference.repository';
import { RegisterDeviceUseCase } from './application/register-device/register-device.use-case';
import { UnregisterDeviceUseCase } from './application/unregister-device/unregister-device.use-case';
import { GetNotificationPreferencesUseCase } from './application/get-notification-preferences/get-notification-preferences.use-case';
import { OwnDeviceScopeGuard } from './presentation/guards/own-device-scope.guard';
import { NotificationsController } from './presentation/notifications.controller';

/**
 * Notifications module (SA §11): owns `device_tokens`,
 * `notification_preferences` and `notification_log`. It is a leaf on the
 * dependency graph — it subscribes to other modules' domain events and is
 * never called into directly (AGENTS §7), so it imports no other module.
 *
 * F-NOT-01/F-NOT-02 wire the `device_tokens` half: the E-09 repository, the
 * module's own own-scope resolver behind `OwnDeviceScopeGuard` (SA §14), and
 * the two use cases TS §13 names. F-NOT-03 adds the E-10
 * `notification_preferences` half (API-050), which needs no ScopeGuard —
 * the route addresses the caller's own collection with no path id.
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
    // F-NOT-02: own-scope resolution for DELETE /devices/{id} (API-049),
    // consumed by its route-specific ScopeGuard (SA §14, TS §15.2).
    {
      provide: DEVICE_TOKEN_SCOPE,
      useClass: DeviceTokenScope,
    },
    OwnDeviceScopeGuard,
    RegisterDeviceUseCase,
    UnregisterDeviceUseCase,
    // F-NOT-03: E-10 preference resolution for API-050.
    {
      provide: NOTIFICATION_PREFERENCE_REPOSITORY,
      useClass: NotificationPreferenceRepository,
    },
    GetNotificationPreferencesUseCase,
  ],
  exports: [
    DEVICE_TOKEN_REPOSITORY,
    DeviceTokenRepository,
    NOTIFICATION_PREFERENCE_REPOSITORY,
  ],
})
export class NotificationsModule {}
