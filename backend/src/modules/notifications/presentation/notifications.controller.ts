import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RegisterDeviceUseCase } from '../application/register-device/register-device.use-case';
import { RegisterDeviceDto } from '../application/register-device/register-device.dto';
import { RegisterDeviceResponseDto } from '../application/register-device/register-device-response.dto';
import { UnregisterDeviceUseCase } from '../application/unregister-device/unregister-device.use-case';
import { GetNotificationPreferencesUseCase } from '../application/get-notification-preferences/get-notification-preferences.use-case';
import { GetNotificationPreferencesResponseDto } from '../application/get-notification-preferences/get-notification-preferences-response.dto';
import { SetNotificationPreferenceUseCase } from '../application/set-notification-preference/set-notification-preference.use-case';
import { SetPreferenceDto } from '../application/set-notification-preference/set-preference.dto';
import { SetNotificationPreferenceResponseDto } from '../application/set-notification-preference/set-notification-preference-response.dto';
import { OwnDeviceScopeGuard } from './guards/own-device-scope.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Notifications routes (TS §13 API implementation mapping —
 * `NotificationsController`). The path is spelled in full because this one
 * controller serves both the `/devices` resource (API-048/049) and
 * `/me/notification-preferences` (API-050/051).
 */
@Controller()
export class NotificationsController {
  constructor(
    private readonly registerDeviceUseCase: RegisterDeviceUseCase,
    private readonly unregisterDeviceUseCase: UnregisterDeviceUseCase,
    private readonly getNotificationPreferencesUseCase: GetNotificationPreferencesUseCase,
    private readonly setNotificationPreferenceUseCase: SetNotificationPreferenceUseCase,
  ) {}

  /**
   * API-048 `POST /devices` — "Any authenticated / Own" (APIS §6.1), so the
   * route carries no `@Roles()`: every role registers its own device and
   * `AuthGuard` is the whole gate. `200`, NOT `201`: re-registering the same
   * token refreshes `last_seen_at` rather than creating a row (VR-29), which
   * makes the endpoint genuinely idempotent (APIS §9.7, §10.12).
   */
  @Post('devices')
  @HttpCode(HttpStatus.OK)
  async registerDevice(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterDeviceDto,
  ): Promise<RegisterDeviceResponseDto> {
    return this.registerDeviceUseCase.execute(req.user.id, dto);
  }

  /**
   * API-049 `DELETE /devices/{id}` — "Any authenticated / Own" (APIS §6.1),
   * again with no `@Roles()`. Ownership is resolved BEFORE this handler by
   * `OwnDeviceScopeGuard` (TS §15.2 "one indexed lookup before the handler
   * runs"); the id handed to the use case is the one that passed that guard.
   * `204 No Content`, no envelope (APIS §9.1), and the row is physically
   * deleted — the one confirmed hard-delete exception (DBD §25).
   */
  @UseGuards(OwnDeviceScopeGuard)
  @Delete('devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregisterDevice(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    return this.unregisterDeviceUseCase.execute(req.user.id, id);
  }

  /**
   * API-050 `GET /me/notification-preferences` — "Any authenticated / Own"
   * (APIS §6.1), so the route carries no `@Roles()`: every role reads its own
   * catalogue and `AuthGuard` is the whole gate. There is no path id, so
   * there is no ScopeGuard either — the caller is the scope (SA §14).
   * Returns the bounded `{ data: [...] }` collection of APIS §9.1, with no
   * `pagination` keys (the catalogue is eight rows, DEC-D03).
   */
  @Get('me/notification-preferences')
  async preferences(
    @Req() req: AuthenticatedRequest,
  ): Promise<GetNotificationPreferencesResponseDto> {
    return this.getNotificationPreferencesUseCase.execute(req.user.id);
  }

  /**
   * API-051 `PATCH /me/notification-preferences` — same "Any / Own" gate as
   * API-050. `200` (APIS §9.6: a successful `PATCH` is `200`, never `201`).
   * `422 ACCOUNT_CRITICAL_CATEGORY` when the category's `is_mutable` is
   * `false` (VR-38) — decided on the catalogue row, so N-03 / N-04 / N-08
   * are refused whatever the client sends.
   */
  @Patch('me/notification-preferences')
  @HttpCode(HttpStatus.OK)
  async setPreference(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetPreferenceDto,
  ): Promise<SetNotificationPreferenceResponseDto> {
    return this.setNotificationPreferenceUseCase.execute(req.user.id, dto);
  }
}
