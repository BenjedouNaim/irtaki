import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RolesGuard } from '../../../shared';
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
@UseGuards(RolesGuard)
export class MeController {
  constructor(
    private readonly getMeUseCase: GetMeUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
  ) {}

  @Get()
  async getMe(@Req() req: AuthenticatedRequest): Promise<MeResponseDto> {
    return this.getMeUseCase.execute(req.user.id);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<MeResponseDto> {
    return this.updateProfileUseCase.execute(req.user.id, dto);
  }
}
