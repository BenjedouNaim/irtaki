import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { ListGroupsUseCase } from '../application/list-groups/list-groups.use-case';
import { ListGroupsResponseDto } from '../application/list-groups/group-list-item.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('groups')
export class GroupsController {
  constructor(private readonly listGroupsUseCase: ListGroupsUseCase) {}

  @Roles(
    UserRole.Admin,
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Student,
    UserRole.User,
  )
  @Get()
  async listGroups(
    @Req() req: AuthenticatedRequest,
  ): Promise<ListGroupsResponseDto> {
    return this.listGroupsUseCase.execute(
      req.user.id,
      req.user.role as UserRole,
    );
  }
}
