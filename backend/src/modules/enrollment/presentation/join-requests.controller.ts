import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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
import { ListPendingJoinRequestsUseCase } from '../application/list-pending-join-requests/list-pending-join-requests.use-case';
import { ListPendingJoinRequestsQueryDto } from '../application/list-pending-join-requests/list-pending-join-requests-query.dto';
import { ListPendingJoinRequestsResponseDto } from '../application/list-pending-join-requests/list-pending-join-requests-response.dto';
import { GetJoinRequestDetailUseCase } from '../application/get-join-request-detail/get-join-request-detail.use-case';
import { GetJoinRequestDetailResponseDto } from '../application/get-join-request-detail/get-join-request-detail-response.dto';
import { AcceptJoinRequestUseCase } from '../application/accept-join-request/accept-join-request.use-case';
import { AcceptJoinRequestResponseDto } from '../application/accept-join-request/accept-join-request-response.dto';

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
    private readonly listPendingJoinRequestsUseCase: ListPendingJoinRequestsUseCase,
    private readonly getJoinRequestDetailUseCase: GetJoinRequestDetailUseCase,
    private readonly acceptJoinRequestUseCase: AcceptJoinRequestUseCase,
  ) {}

  @Roles(UserRole.Assistant, UserRole.Admin)
  @Get()
  async listPending(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListPendingJoinRequestsQueryDto,
  ): Promise<ListPendingJoinRequestsResponseDto> {
    if (query.status !== 'pending') {
      throw new BadRequestException('Status query parameter must be "pending"');
    }
    return this.listPendingJoinRequestsUseCase.execute(
      req.user.id,
      req.user.role,
      query,
    );
  }

  @Roles(UserRole.User)
  @Get('mine')
  async mine(@Req() req: AuthenticatedRequest): Promise<JoinRequestStatusDto> {
    return this.getOwnJoinRequestUseCase.execute(req.user.id);
  }

  @Roles(UserRole.Assistant, UserRole.Admin)
  @Get(':id')
  async detail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<GetJoinRequestDetailResponseDto> {
    return this.getJoinRequestDetailUseCase.execute(
      req.user.id,
      req.user.role,
      id,
    );
  }

  @Roles(UserRole.Assistant, UserRole.Admin)
  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<AcceptJoinRequestResponseDto> {
    return this.acceptJoinRequestUseCase.execute(
      req.user.id,
      req.user.role,
      id,
    );
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

