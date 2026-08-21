import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import type { IMailer } from '../../domain/mailer.interface';
import { MAILER } from '../../domain/mailer.interface';
import { TokenService } from '../token/token.service';
import { RequestPasswordResetDto } from './request-password-reset.dto';

export interface RequestPasswordResetResponse {
  message: string;
}

@Injectable()
export class RequestPasswordResetUseCase {
  private readonly logger = new Logger(RequestPasswordResetUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(MAILER)
    private readonly mailer: IMailer,
    private readonly tokenService: TokenService,
  ) {}

  async execute(
    dto: RequestPasswordResetDto,
  ): Promise<RequestPasswordResetResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (user) {
      const { rawToken } = await this.tokenService.generatePasswordResetToken(
        user.id,
      );

      try {
        await this.mailer.sendPasswordResetEmail(user.email, rawToken);
      } catch (error) {
        // SA §559 & AGENTS.md §8: External notification failure must never block/fail the request
        this.logger.warn(
          `Failed to send password reset email to ${user.email}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return {
      message:
        'إذا كان البريد الإلكتروني مسجلاً، فقد تم إرسال رابط إعادة تعيين كلمة المرور.',
    };
  }
}
