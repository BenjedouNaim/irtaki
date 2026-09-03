import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { RegisterDeviceUseCase } from '../application/register-device/register-device.use-case';
import { RegisterDeviceDto } from '../application/register-device/register-device.dto';
import { RegisterDeviceResponseDto } from '../application/register-device/register-device-response.dto';

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
 * controller serves the `/devices` resource (API-048/049) and, later,
 * `/me/notification-preferences` (API-050/051).
 */
@Controller()
export class NotificationsController {
  constructor(private readonly registerDeviceUseCase: RegisterDeviceUseCase) {}

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
}
