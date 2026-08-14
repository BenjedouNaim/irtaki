import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

/**
 * HealthController — ops/infrastructure endpoint.
 *
 * GET /health  →  200 { status: 'ok', timestamp: <ISO-8601> }
 *
 * Not a product API (not in APIS.md's 54 endpoints), not URI-versioned.
 * Used by the deployment platform (Coolify) and monitoring (Healthchecks.io)
 * to confirm the server process has started and is accepting connections.
 * No authentication required — purely a liveness check.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
