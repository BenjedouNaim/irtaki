import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetOwnMembershipUseCase } from '../application/get-own-membership/get-own-membership.use-case';
import { OwnMembershipResponseDto } from '../application/get-own-membership/get-own-membership-response.dto';

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
  ) {}

  @Roles(UserRole.Student)
  @Get('mine')
  async mine(
    @Req() req: AuthenticatedRequest,
  ): Promise<OwnMembershipResponseDto> {
    return this.getOwnMembershipUseCase.execute(req.user.id);
  }
}
