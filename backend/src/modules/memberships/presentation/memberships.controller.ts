import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetOwnMembershipUseCase } from '../application/get-own-membership/get-own-membership.use-case';
import { OwnMembershipResponseDto } from '../application/get-own-membership/get-own-membership-response.dto';
import { TerminateMembershipUseCase } from '../application/terminate-membership/terminate-membership.use-case';
import { TerminateMembershipResponseDto } from '../application/terminate-membership/terminate-membership-response.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('memberships')
export class MembershipsController {
  constructor(
    private readonly getOwnMembershipUseCase: GetOwnMembershipUseCase,
    private readonly terminateMembershipUseCase: TerminateMembershipUseCase,
  ) {}

  @Roles(UserRole.Student)
  @Get('mine')
  async mine(
    @Req() req: AuthenticatedRequest,
  ): Promise<OwnMembershipResponseDto> {
    return this.getOwnMembershipUseCase.execute(req.user.id);
  }

  @Roles(UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  async terminate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TerminateMembershipResponseDto> {
    return this.terminateMembershipUseCase.execute(req.user.id, id);
  }
}
