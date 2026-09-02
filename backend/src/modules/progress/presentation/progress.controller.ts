import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { MembershipProgressScopeGuard } from './guards/membership-progress-scope.guard';
import { GetMembershipProgressUseCase } from '../application/get-membership-progress/get-membership-progress.use-case';
import { GetMembershipProgressResponseDto } from '../application/get-membership-progress/get-membership-progress-response.dto';
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
  constructor(
    private readonly getOwnProgressUseCase: GetOwnProgressUseCase,
    private readonly getMembershipProgressUseCase: GetMembershipProgressUseCase,
  ) {}

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

  /**
   * API-042 `GET /memberships/{id}/progress` — Teacher (assigned group) and
   * Admin (all). Assistant is deliberately absent from @Roles() (DEC-B09).
   * Scope is verified upstream by MembershipProgressScopeGuard (TS §15.2).
   */
  @Roles(UserRole.Admin, UserRole.Teacher)
  @UseGuards(MembershipProgressScopeGuard)
  @Get('memberships/:id/progress')
  async forMembership(
    @Param('id') id: string,
  ): Promise<GetMembershipProgressResponseDto> {
    return this.getMembershipProgressUseCase.execute(id);
  }
}
