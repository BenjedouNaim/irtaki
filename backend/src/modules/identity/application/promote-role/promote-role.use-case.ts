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
import {
  InvalidPromotionTargetRoleError,
  SourceRoleNotUserError,
} from '../../domain/user.errors';
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

    // A uuid is case-insensitive: Postgres resolves `018F…` and `018f…` to the
    // same row, so the self-guard has to as well, or an Admin passing their own
    // id in upper-case hex would fall through to `422 SOURCE_ROLE_NOT_USER`
    // instead of the `403 CANNOT_PROMOTE_SELF` APIS §10.13 mandates.
    if (targetUserId.toLowerCase() === callerId.toLowerCase()) {
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
      if (err instanceof InvalidPromotionTargetRoleError) {
        // TS §21 — a domain-layer validation failure surfaces as 422, the same
        // envelope the transport allow-list produces, never as a bare 500.
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: err.message,
          details: [{ field: 'role', rule: 'BR-R03', message: err.message }],
        });
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
