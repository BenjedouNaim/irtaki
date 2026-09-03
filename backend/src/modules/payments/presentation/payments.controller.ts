import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetGroupPaymentLedgerUseCase } from '../application/get-group-payment-ledger/get-group-payment-ledger.use-case';
import { GetGroupPaymentLedgerResponseDto } from '../application/get-group-payment-ledger/get-group-payment-ledger-response.dto';
import { GetOwnPaymentLedgerUseCase } from '../application/get-own-payment-ledger/get-own-payment-ledger.use-case';
import { GetOwnPaymentLedgerResponseDto } from '../application/get-own-payment-ledger/get-own-payment-ledger-response.dto';
import { GetGroupPaymentsQueryDto } from './dto/get-group-payments-query.dto';
import { GroupPaymentsScopeGuard } from './guards/group-payments-scope.guard';

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
}
