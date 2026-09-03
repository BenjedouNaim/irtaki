import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetOwnPaymentLedgerUseCase } from '../application/get-own-payment-ledger/get-own-payment-ledger.use-case';
import { GetOwnPaymentLedgerResponseDto } from '../application/get-own-payment-ledger/get-own-payment-ledger-response.dto';

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
}
