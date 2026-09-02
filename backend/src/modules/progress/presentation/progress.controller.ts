import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetOwnProgressUseCase } from '../application/get-own-progress/get-own-progress.use-case';
import { GetOwnProgressResponseDto } from '../application/get-own-progress/get-own-progress-response.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Progress routes (TS §13 API implementation mapping — `ProgressController`).
 */
@Controller()
export class ProgressController {
  constructor(private readonly getOwnProgressUseCase: GetOwnProgressUseCase) {}

  /**
   * API-041 `GET /me/progress` — Student only (APIS §6.1: Assistant blocked by
   * DEC-B09 through RolesGuard alone; Teacher/Admin/User not allowed).
   */
  @Roles(UserRole.Student)
  @Get('me/progress')
  async mine(
    @Req() req: AuthenticatedRequest,
  ): Promise<GetOwnProgressResponseDto> {
    return this.getOwnProgressUseCase.execute(req.user.id);
  }
}
