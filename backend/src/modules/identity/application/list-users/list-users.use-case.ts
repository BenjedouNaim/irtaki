import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import { ListUsersQueryDto } from './list-users-query.dto';
import { ListUsersResponseDto } from './user-list-item.dto';

@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(query: ListUsersQueryDto): Promise<ListUsersResponseDto> {
    const users = await this.userRepository.findAllByRole(query.role);

    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.fullName ?? null,
        role: u.role,
      })),
    };
  }
}
