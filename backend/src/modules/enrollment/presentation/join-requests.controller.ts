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
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { RateLimitGuard, Roles } from '../../../shared';
import { AUTH_THROTTLER } from '../../../config/rate-limit.config';
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
import { RejectJoinRequestUseCase } from '../application/reject-join-request/reject-join-request.use-case';
import { RejectJoinRequestResponseDto } from '../application/reject-join-request/reject-join-request-response.dto';

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
    private readonly rejectJoinRequestUseCase: RejectJoinRequestUseCase,
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

  /**
   * API-023 `POST /join-requests/{id}/accept` — **Assistant only**, on their
   * assigned group. APIS §6.1's row `POST /join-requests/{id}/accept|reject`
   * is `— | — | ✓ (g) | — | —`: the Admin reads the queue (`GET
   * /join-requests`, `✓ all`) but does not decide. SRS §10 says the same in
   * its own words — "Join Request | Admin: R | … | Assistant: R A (own
   * groups)" — and FR-REQ-04 / UC-04 name the Assistant as the only actor,
   * as does APIS §9.7's concurrency row ("Two Assistants act concurrently").
   * The Admin is therefore absent from `@Roles()` and RolesGuard refuses.
   */
  @Roles(UserRole.Assistant)
  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<AcceptJoinRequestResponseDto> {
    return this.acceptJoinRequestUseCase.execute(req.user.id, id);
  }

  /** API-024 `POST /join-requests/{id}/reject` — Assistant only, exactly as
   *  API-023 above (same APIS §6.1 row, same SRS §10 "R A" grant). */
  @Roles(UserRole.Assistant)
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<RejectJoinRequestResponseDto> {
    return this.rejectJoinRequestUseCase.execute(req.user.id, id);
  }

  /**
   * APIS §9.8 / ISS-19: the ONLY throttled non-auth endpoint. TS §16 makes
   * it per-user, so `RateLimitGuard`'s `join-requests` throttler keys on
   * `req.user.id`; the `auth` throttler is skipped so a submission never
   * consumes the caller's login budget.
   */
  @Roles(UserRole.User)
  @UseGuards(RateLimitGuard)
  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitJoinRequestDto,
  ): Promise<SubmitJoinRequestResponseDto> {
    return this.submitJoinRequestUseCase.execute(req.user.id, dto);
  }
}
