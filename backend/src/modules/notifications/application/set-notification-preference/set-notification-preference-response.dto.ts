import { NotificationPreferenceDto } from '../notification-preference.dto';

/** APIS §9.1 single-resource envelope — the row as it now stands. */
export interface SetNotificationPreferenceResponseDto {
  data: NotificationPreferenceDto;
}
