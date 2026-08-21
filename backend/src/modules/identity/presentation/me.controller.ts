import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../domain/user-role.enum';
import { GetMeUseCase } from '../application/me/get-me.use-case';
import { UpdateProfileUseCase } from '../application/me/update-profile.use-case';
import { UpdateProfileDto } from '../application/me/update-profile.dto';
import { MeResponseDto } from '../application/me/me-response.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('me')
export class MeController {
  constructor(
    private readonly getMeUseCase: GetMeUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
  ) {}

  @Roles(
    UserRole.Admin,
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Student,
    UserRole.User,
  )
  @Get()
  async getMe(@Req() req: AuthenticatedRequest): Promise<MeResponseDto> {
    return this.getMeUseCase.execute(req.user.id);
  }

  @Roles(
    UserRole.Admin,
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Student,
    UserRole.User,
  )
  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<MeResponseDto> {
    return this.updateProfileUseCase.execute(req.user.id, dto);
  }
}
