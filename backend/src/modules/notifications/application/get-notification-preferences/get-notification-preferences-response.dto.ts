import { NotificationPreferenceDto } from '../notification-preference.dto';

/**
 * APIS §9.1 collection envelope WITHOUT `pagination`: the catalogue is a
 * bounded, non-paginated collection (eight rows, DEC-D03), and APIS §9.2
 * lists the cursor-paginated endpoints — this is not one of them.
 */
export interface GetNotificationPreferencesResponseDto {
  data: NotificationPreferenceDto[];
}
