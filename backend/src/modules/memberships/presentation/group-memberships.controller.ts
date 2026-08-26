import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetRosterUseCase } from '../application/get-roster/get-roster.use-case';
import { GetRosterResponseDto } from '../application/get-roster/get-roster-response.dto';
import { GetRosterQueryDto } from './dto/get-roster-query.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('groups')
export class GroupMembershipsController {
  constructor(private readonly getRosterUseCase: GetRosterUseCase) {}

  @Roles(UserRole.Admin, UserRole.Teacher, UserRole.Assistant)
  @Get(':id/memberships')
  async roster(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: GetRosterQueryDto,
  ): Promise<GetRosterResponseDto> {
    return this.getRosterUseCase.execute(
      req.user.id,
      req.user.role as UserRole,
      id,
      query.as_of,
    );
  }
}
