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
import { SetNotificationPreferenceUseCase } from './application/set-notification-preference/set-notification-preference.use-case';
import { OwnDeviceScopeGuard } from './presentation/guards/own-device-scope.guard';
import { NotificationsController } from './presentation/notifications.controller';
import { NOTIFICATION_LOG_REPOSITORY } from './domain/notification-log.repository.interface';
import { NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY } from './domain/notification-dispatch-context.repository.interface';
import { PUSH_SENDER } from './domain/push-sender.interface';
import { NotificationLogRepository } from './infrastructure/notification-log.repository';
import { NotificationDispatchContextRepository } from './infrastructure/notification-dispatch-context.repository';
import { ExpoPushSender } from './infrastructure/expo-push.sender';
import { NotificationService } from './application/dispatch/notification.service';
import { NOTIFICATION_EVALUATION_REPOSITORY } from './domain/notification-evaluation.repository.interface';
import { NotificationEvaluationRepository } from './infrastructure/notification-evaluation.repository';
import { EnrollmentNotificationListener } from './application/listeners/enrollment-notification.listener';
import { MembershipNotificationListener } from './application/listeners/membership-notification.listener';
import { DailyReminderEvaluator } from './application/evaluators/daily-reminder.evaluator';
import { WeeklyReportAvailableEvaluator } from './application/evaluators/weekly-report-available.evaluator';
import { AtRiskEvaluator } from './application/evaluators/at-risk.evaluator';
import { PaymentDueSoonEvaluator } from './application/evaluators/payment-due-soon.evaluator';

/**
 * Notifications module (SA §11): owns `device_tokens`,
 * `notification_preferences` and `notification_log`. It is a leaf on the
 * dependency graph — it subscribes to other modules' domain events and is
 * never called into directly (AGENTS §7), so it imports no other module.
 *
 * F-NOT-01/F-NOT-02 wire the `device_tokens` half: the E-09 repository, the
 * module's own own-scope resolver behind `OwnDeviceScopeGuard` (SA §14), and
 * the two use cases TS §13 names. F-NOT-03/F-NOT-04 add the E-10
 * `notification_preferences` half (API-050/051), which needs no ScopeGuard —
 * both routes address the caller's own collection with no path id.
 *
 * F-NOT-05 adds the dispatch half: `NotificationService`, the single path
 * every one of SAS §22.2's eight events takes (ADR-009, SA §21), the E-11
 * `notification_log` writer behind it and the EXT-03 push adapter
 * (ADR-020). None of it is exported — SA §11 keeps this module a
 * subscriber, so the only way in is an event or a tick of its own.
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
    // F-NOT-03/F-NOT-04: E-10 preference resolution for API-050/051.
    {
      provide: NOTIFICATION_PREFERENCE_REPOSITORY,
      useClass: NotificationPreferenceRepository,
    },
    GetNotificationPreferencesUseCase,
    SetNotificationPreferenceUseCase,
    // F-NOT-05: the SA §21 dispatch path — E-11 logging, the §22.3
    // re-check reads and the ADR-020 transport behind one service.
    {
      provide: NOTIFICATION_LOG_REPOSITORY,
      useClass: NotificationLogRepository,
    },
    {
      provide: NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY,
      useClass: NotificationDispatchContextRepository,
    },
    {
      provide: PUSH_SENDER,
      useClass: ExpoPushSender,
    },
    NotificationService,
    // F-NOT-05: the four event listeners (N-03/N-04/N-05/N-08) and the four
    // scheduler-evaluated events (N-01/N-02/N-06/N-07). Every one of the
    // eight goes through NotificationService and nothing else.
    EnrollmentNotificationListener,
    MembershipNotificationListener,
    {
      provide: NOTIFICATION_EVALUATION_REPOSITORY,
      useClass: NotificationEvaluationRepository,
    },
    DailyReminderEvaluator,
    WeeklyReportAvailableEvaluator,
    AtRiskEvaluator,
    PaymentDueSoonEvaluator,
  ],
  // SA §11: Notifications is a module other modules never call into directly —
  // they emit events and it listens. Only the device-token pair predating
  // F-NOT-03 is exported; the E-10 preference repository is deliberately NOT,
  // so no module can acquire an injection point into this one.
  exports: [DEVICE_TOKEN_REPOSITORY, DeviceTokenRepository],
})
export class NotificationsModule {}
