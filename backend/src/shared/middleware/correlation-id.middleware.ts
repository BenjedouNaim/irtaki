import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const correlationStorage = new AsyncLocalStorage<Map<string, string>>();

/**
 * Returns the correlation ID for the active asynchronous execution context, if any.
 */
export function getCorrelationId(): string | undefined {
  const store = correlationStorage.getStore();
  return store?.get('correlationId');
}

/**
 * CorrelationIdMiddleware (ADR-033, APIS §9.5, TS §30).
 *
 * Captures or generates a unique correlationId per HTTP request,
 * attaches it to response headers, request object, and sets up
 * AsyncLocalStorage for transparent propagation to structured logging and error envelopes.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawHeader = req.headers['x-correlation-id'];
    const correlationId =
      typeof rawHeader === 'string' && rawHeader.trim().length > 0
        ? rawHeader.trim()
        : randomUUID();

    // Attach to request object and response header
    (req as Request & { correlationId?: string }).correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);

    const store = new Map<string, string>();
    store.set('correlationId', correlationId);

    correlationStorage.run(store, () => {
      next();
    });
  }
}
