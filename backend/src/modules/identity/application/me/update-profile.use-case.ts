import {
  Inject,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import { isValidIanaTimezone } from '../../domain/timezone.util';
import { UpdateProfileDto } from './update-profile.dto';
import { MeResponseDto } from './me-response.dto';

@Injectable()
export class UpdateProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(userId: string, dto: UpdateProfileDto): Promise<MeResponseDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'المستخدم غير موجود أو انتهت صلاحية الجلسة',
      });
    }

    if (dto.timezone !== undefined) {
      if (!isValidIanaTimezone(dto.timezone)) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'INVALID_TIMEZONE',
          message: 'المنطقة الزمنية المحددة غير صالحة',
        });
      }

      user.updateTimezone(dto.timezone.trim());
      await this.userRepository.save(user);
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
