import { Controller, Get, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetStudentProgressUseCase } from '../application/get-student-progress/get-student-progress.use-case';
import { GetStudentProgressResponseDto } from '../application/get-student-progress/get-student-progress-response.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * API-042 `GET /memberships/{id}/progress` — Teacher (assigned group) and
 * Admin (all). Assistant is deliberately absent from @Roles() (DEC-B09).
 */
@Controller('memberships')
export class MembershipProgressController {
  constructor(
    private readonly getStudentProgressUseCase: GetStudentProgressUseCase,
  ) {}

  @Roles(UserRole.Admin, UserRole.Teacher)
  @Get(':id/progress')
  async progress(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<GetStudentProgressResponseDto> {
    return this.getStudentProgressUseCase.execute(
      req.user.id,
      req.user.role as UserRole,
      id,
    );
  }
}
