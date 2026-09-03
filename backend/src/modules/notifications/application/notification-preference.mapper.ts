import { NotificationPreferenceRecord } from '../domain/notification-preference.repository.interface';
import { NotificationPreferenceDto } from './notification-preference.dto';

/** One merged catalogue record → the `NotificationPreferenceDto` wire shape (TS §13). */
export function toNotificationPreferenceDto(
  record: NotificationPreferenceRecord,
): NotificationPreferenceDto {
  return {
    category: record.code,
    description: record.description,
    is_mutable: record.isMutable,
    muted: record.muted,
  };
}
