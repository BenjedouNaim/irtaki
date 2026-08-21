import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import { MeResponseDto } from './me-response.dto';

@Injectable()
export class GetMeUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(userId: string): Promise<MeResponseDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'المستخدم غير موجود أو انتهت صلاحية الجلسة',
      });
    }

    return {
      id: user.id,
      role: user.role,
      email: user.email,
      full_name: user.fullName,
      gender: user.gender,
      timezone: user.timezone,
    };
  }
}
