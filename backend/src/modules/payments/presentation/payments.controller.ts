import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetGroupPaymentLedgerUseCase } from '../application/get-group-payment-ledger/get-group-payment-ledger.use-case';
import { GetGroupPaymentLedgerResponseDto } from '../application/get-group-payment-ledger/get-group-payment-ledger-response.dto';
import { GetOwnPaymentLedgerUseCase } from '../application/get-own-payment-ledger/get-own-payment-ledger.use-case';
import { GetOwnPaymentLedgerResponseDto } from '../application/get-own-payment-ledger/get-own-payment-ledger-response.dto';
import { RecordPaymentCycleUseCase } from '../application/record-payment-cycle/record-payment-cycle.use-case';
import { RecordPaymentCycleResponseDto } from '../application/record-payment-cycle/payment-record.dto';
import { GetGroupPaymentsQueryDto } from './dto/get-group-payments-query.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { GroupPaymentsScopeGuard } from './guards/group-payments-scope.guard';
import { MembershipPaymentsScopeGuard } from './guards/membership-payments-scope.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Payments routes (TS §13 API implementation mapping — `PaymentsController`).
 */
@Controller()
export class PaymentsController {
  constructor(
    private readonly getOwnPaymentLedgerUseCase: GetOwnPaymentLedgerUseCase,
    private readonly getGroupPaymentLedgerUseCase: GetGroupPaymentLedgerUseCase,
    private readonly recordPaymentCycleUseCase: RecordPaymentCycleUseCase,
  ) {}

  /**
   * API-045 `GET /me/payments` — Student only, scope "own" (APIS §6.1).
   * Every other role is simply absent from `@Roles()`, so RolesGuard alone
   * yields the uniform `403` — including **Teacher**, whose payment
   * exclusion SRS §10 states unconditionally. There is no path id to guard:
   * the caller's own Active membership is resolved inside the use case's
   * single repository lookup (TS §15.2).
   */
  @Roles(UserRole.Student)
  @Get('me/payments')
  async mine(
    @Req() req: AuthenticatedRequest,
  ): Promise<GetOwnPaymentLedgerResponseDto> {
    return this.getOwnPaymentLedgerUseCase.execute(req.user.id);
  }

  /**
   * API-046 `GET /groups/{id}/payments?status=` — Assistant (assigned
   * group) and Admin (all), per APIS §6.1 and SRS §10 ("Payment record —
   * Assistant: R U (own groups), Admin: R").
   *
   * **Teacher is deliberately absent from `@Roles()`**: SRS §10 grants the
   * Teacher no payment access at all and UC-09 says "Teacher: never", so
   * RolesGuard alone yields the unconditional `403`, whatever group the
   * Teacher is assigned to. This inverts DEC-B09, which excludes the
   * *Assistant* from Reports/Progress/Performance — the Assistant is the
   * primary actor here, and the two exclusions must never be swapped.
   *
   * Scope is resolved BEFORE this handler by `GroupPaymentsScopeGuard`
   * (TS §15.2 "one indexed lookup before the handler runs"); the id handed
   * to the use case is the one that passed that guard.
   */
  @Roles(UserRole.Admin, UserRole.Assistant)
  @UseGuards(GroupPaymentsScopeGuard)
  @Get('groups/:id/payments')
  async forGroup(
    @Param('id') id: string,
    @Query() query: GetGroupPaymentsQueryDto,
  ): Promise<GetGroupPaymentLedgerResponseDto> {
    return this.getGroupPaymentLedgerUseCase.execute(id, {
      status: query.status,
    });
  }

  /**
   * API-047 `POST /memberships/{id}/payments` — the assigned Assistant
   * records one cycle as paid. `201` (APIS §9.6: a resource-creating POST).
   *
   * **`@Roles(Assistant)` is the whole list.** BR-34 says "only the
   * Assistant may record a payment" and APIS §6.1 names the Assistant as
   * the sole actor, so even the Admin is absent here — unlike the two read
   * routes, where the Admin is an actor and bypasses the ScopeGuard
   * (DEC-C07). The Teacher's exclusion is SRS §10's, the inverse of
   * DEC-B09's Assistant exclusion on Reports/Progress/Performance; the two
   * must never be swapped.
   *
   * Scope (VR-27) is resolved BEFORE this handler by
   * `MembershipPaymentsScopeGuard` (TS §15.2); the id handed to the use
   * case is the one that passed that guard.
   *
   * The body carries `cycle_index` only — the 30 TND fee is BR-31's fixed
   * constant, applied by the use case, and can never be supplied, chosen or
   * influenced by the caller. No route exists to reverse or correct this
   * write, by design (ISS-02/APIQ-02).
   */
  @Roles(UserRole.Assistant)
  @UseGuards(MembershipPaymentsScopeGuard)
  @Post('memberships/:id/payments')
  async recordPayment(
    @Param('id') id: string,
    @Body() body: RecordPaymentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RecordPaymentCycleResponseDto> {
    return this.recordPaymentCycleUseCase.execute({
      membershipId: id,
      recordedBy: req.user.id,
      cycleIndex: body.cycle_index,
    });
  }
}
