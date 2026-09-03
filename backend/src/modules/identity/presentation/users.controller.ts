import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../domain/user-role.enum';
import { ListUsersUseCase } from '../application/list-users/list-users.use-case';
import { ListUsersQueryDto } from '../application/list-users/list-users-query.dto';
import { ListUsersResponseDto } from '../application/list-users/user-list-item.dto';
import { PromoteRoleUseCase } from '../application/promote-role/promote-role.use-case';
import { PromoteRoleDto } from '../application/promote-role/promote-role.dto';
import { PromoteRoleResponseDto } from '../application/promote-role/promote-role-response.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly promoteRoleUseCase: PromoteRoleUseCase,
  ) {}

  @Roles(UserRole.Admin)
  @Get()
  async listUsers(
    @Query() query: ListUsersQueryDto,
  ): Promise<ListUsersResponseDto> {
    return this.listUsersUseCase.execute(query);
  }

  @Roles(UserRole.Admin)
  @Patch(':id/role')
  async promoteRole(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: PromoteRoleDto,
  ): Promise<PromoteRoleResponseDto> {
    return this.promoteRoleUseCase.execute(req.user.id, id, body.role);
  }
}
