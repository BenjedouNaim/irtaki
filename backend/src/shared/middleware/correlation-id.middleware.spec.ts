import { Request, Response, NextFunction } from 'express';
import {
  CorrelationIdMiddleware,
  getCorrelationId,
} from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;
  let mockRequest: Partial<Request & { correlationId?: string }>;
  let mockResponse: Partial<Response>;
  let setHeaderMock: jest.Mock;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
    setHeaderMock = jest.fn();
    mockResponse = {
      setHeader: setHeaderMock,
    };
  });

  it('generates a new correlationId when none is provided in headers', (done) => {
    mockRequest = {
      headers: {},
    };

    const next: NextFunction = () => {
      expect(mockRequest.correlationId).toBeDefined();
      expect(typeof mockRequest.correlationId).toBe('string');
      expect(mockRequest.correlationId!.length).toBeGreaterThan(0);
      expect(setHeaderMock).toHaveBeenCalledWith(
        'X-Correlation-Id',
        mockRequest.correlationId,
      );
      expect(getCorrelationId()).toBe(mockRequest.correlationId);
      done();
    };

    middleware.use(mockRequest as Request, mockResponse as Response, next);
  });

  it('preserves and propagates an existing X-Correlation-Id header', (done) => {
    const existingCorrelationId = 'incoming-custom-cid-98765';
    mockRequest = {
      headers: {
        'x-correlation-id': existingCorrelationId,
      },
    };

    const next: NextFunction = () => {
      expect(mockRequest.correlationId).toBe(existingCorrelationId);
      expect(setHeaderMock).toHaveBeenCalledWith(
        'X-Correlation-Id',
        existingCorrelationId,
      );
      expect(getCorrelationId()).toBe(existingCorrelationId);
      done();
    };

    middleware.use(mockRequest as Request, mockResponse as Response, next);
  });
});
