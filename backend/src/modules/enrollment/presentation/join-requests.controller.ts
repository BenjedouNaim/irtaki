import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { SubmitJoinRequestUseCase } from '../application/submit-join-request/submit-join-request.use-case';
import { SubmitJoinRequestDto } from '../application/submit-join-request/submit-join-request.dto';
import { SubmitJoinRequestResponseDto } from '../application/submit-join-request/submit-join-request-response.dto';
import { GetOwnJoinRequestUseCase } from '../application/get-own-join-request-status/get-own-join-request-status.use-case';
import { JoinRequestStatusDto } from '../application/get-own-join-request-status/get-own-join-request-status-response.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('join-requests')
export class JoinRequestsController {
  constructor(
    private readonly submitJoinRequestUseCase: SubmitJoinRequestUseCase,
    private readonly getOwnJoinRequestUseCase: GetOwnJoinRequestUseCase,
  ) {}

  @Roles(UserRole.User)
  @Get('mine')
  async mine(@Req() req: AuthenticatedRequest): Promise<JoinRequestStatusDto> {
    return this.getOwnJoinRequestUseCase.execute(req.user.id);
  }

  @Roles(UserRole.User)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitJoinRequestDto,
  ): Promise<SubmitJoinRequestResponseDto> {
    return this.submitJoinRequestUseCase.execute(req.user.id, dto);
  }
}
