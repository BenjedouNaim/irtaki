import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { PromotionTargetRole } from '../../domain/user-role.enum';
import { SourceRoleNotUserError } from '../../domain/user.errors';
import { PromoteRoleResponseDto } from './promote-role-response.dto';

/** APIS §9.6 — a malformed uuid path segment resolves to 404, not 400. */
const USER_ID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UC-17 — `PATCH /users/{id}/role` (API-052, TS §12/§13).
 *
 * Promotion only: the target must currently hold exactly `role = User`
 * (BR-R03), which is the reason no Teacher/Assistant/Student/Admin can be
 * demoted or reassigned through this endpoint (ISS-03). The Admin can never
 * be the target of their own promotion (FR-ADMIN-02).
 */
@Injectable()
export class PromoteRoleUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(
    callerId: string,
    targetUserId: string,
    role: PromotionTargetRole,
  ): Promise<PromoteRoleResponseDto> {
    if (!USER_ID_SHAPE.test(targetUserId)) {
      throw this.notFound();
    }

    if (targetUserId === callerId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'CANNOT_PROMOTE_SELF',
        message: 'لا يمكنك تغيير دور حسابك الخاص',
      });
    }

    const user = await this.userRepository.findById(targetUserId);
    if (!user) {
      throw this.notFound();
    }

    try {
      user.promoteTo(role);
    } catch (err) {
      if (err instanceof SourceRoleNotUserError) {
        throw this.sourceRoleNotUser(err.message);
      }
      throw err;
    }

    const promoted = await this.userRepository.promoteFromUserRole(
      user.id,
      role,
    );
    if (!promoted) {
      // The row stopped being `role = User` between the read and the write.
      throw this.sourceRoleNotUser();
    }

    return {
      data: {
        id: user.id,
        email: user.email,
        full_name: user.fullName ?? null,
        role: user.role,
      },
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      error: 'NOT_FOUND',
      message: 'المورد المطلوب غير موجود',
    });
  }

  private sourceRoleNotUser(
    message = new SourceRoleNotUserError().message,
  ): UnprocessableEntityException {
    return new UnprocessableEntityException({
      statusCode: 422,
      error: 'SOURCE_ROLE_NOT_USER',
      message,
    });
  }
}
