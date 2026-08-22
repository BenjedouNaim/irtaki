import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../../shared';
import { UserRole } from '../domain/user-role.enum';
import { ListUsersUseCase } from '../application/list-users/list-users.use-case';
import { ListUsersQueryDto } from '../application/list-users/list-users-query.dto';
import { ListUsersResponseDto } from '../application/list-users/user-list-item.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly listUsersUseCase: ListUsersUseCase) {}

  @Roles(UserRole.Admin)
  @Get()
  async listUsers(
    @Query() query: ListUsersQueryDto,
  ): Promise<ListUsersResponseDto> {
    return this.listUsersUseCase.execute(query);
  }
}
