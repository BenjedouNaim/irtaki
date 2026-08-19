import {
  ArgumentsHost,
  ConflictException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HttpExceptionFilter, ErrorEnvelope } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request & { correlationId?: string }>;
  let mockArgumentsHost: ArgumentsHost;
  let responseJson: ErrorEnvelope | null = null;
  let responseStatusCode: number | null = null;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    responseJson = null;
    responseStatusCode = null;

    mockResponse = {
      status: jest.fn().mockImplementation((code: number) => {
        responseStatusCode = code;
        return mockResponse;
      }),
      json: jest.fn().mockImplementation((payload: ErrorEnvelope) => {
        responseJson = payload;
        return mockResponse;
      }),
    };

    mockRequest = {
      url: '/api/v1/test',
      method: 'POST',
      correlationId: 'test-correlation-id-1234',
    };

    mockArgumentsHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as Response,
        getRequest: () => mockRequest as Request,
        getNext: jest.fn(),
      }),
    } as unknown as ArgumentsHost;
  });

  function assertCleanErrorEnvelope(envelope: ErrorEnvelope) {
    expect(envelope).toBeDefined();
    expect(envelope.correlationId).toBe('test-correlation-id-1234');
    expect(typeof envelope.statusCode).toBe('number');
    expect(typeof envelope.error).toBe('string');
    expect(typeof envelope.message).toBe('string');

    // Ensure no Postgres / DB leakages
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toMatch(/duplicate key/i);
    expect(serialized).not.toMatch(/violates unique constraint/i);
    expect(serialized).not.toMatch(/violates foreign key constraint/i);
    expect(serialized).not.toMatch(/at (.+):[0-9]+:[0-9]+/); // stack trace pattern
  }

  it('handles UnauthorizedException (401) with clean envelope and no details', () => {
    const exception = new UnauthorizedException({
      statusCode: 401,
      error: 'TOKEN_EXPIRED',
      message: 'انتهت صلاحية الجلسة',
    });

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(responseJson).toEqual({
      statusCode: 401,
      error: 'TOKEN_EXPIRED',
      message: 'انتهت صلاحية الجلسة',
      correlationId: 'test-correlation-id-1234',
    });
    expect(responseJson?.details).toBeUndefined();
    assertCleanErrorEnvelope(responseJson!);
  });

  it('handles NotFoundException (404) with default error mapping and no details', () => {
    const exception = new NotFoundException('المورد المطلوب غير موجود');

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatusCode).toBe(HttpStatus.NOT_FOUND);
    expect(responseJson?.error).toBe('NOT_FOUND');
    expect(responseJson?.message).toBe('المورد المطلوب غير موجود');
    expect(responseJson?.details).toBeUndefined();
    assertCleanErrorEnvelope(responseJson!);
  });

  it('handles ConflictException (409) preserving custom error code', () => {
    const exception = new ConflictException({
      statusCode: 409,
      error: 'DUPLICATE_REPORT',
      message: 'تم تسجيل تقرير لهذا اليوم بالفعل',
    });

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatusCode).toBe(HttpStatus.CONFLICT);
    expect(responseJson?.error).toBe('DUPLICATE_REPORT');
    expect(responseJson?.message).toBe('تم تسجيل تقرير لهذا اليوم بالفعل');
    expect(responseJson?.details).toBeUndefined();
    assertCleanErrorEnvelope(responseJson!);
  });

  it('handles UnprocessableEntityException (422) with details array', () => {
    const details = [
      {
        field: 'absence_reason',
        rule: 'VR-19',
        message: 'مطلوب عند نوع الغياب',
      },
    ];
    const exception = new UnprocessableEntityException({
      statusCode: 422,
      error: 'VALIDATION_ERROR',
      message: 'فشل التحقق من صحة البيانات',
      details,
    });

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(responseJson?.statusCode).toBe(422);
    expect(responseJson?.error).toBe('VALIDATION_ERROR');
    expect(responseJson?.details).toEqual(details);
    assertCleanErrorEnvelope(responseJson!);
  });

  it('sanitizes unexpected Error (500) and does not leak stack trace or internal error messages', () => {
    const exception = new Error(
      'pg: duplicate key value violates unique constraint "UQ_groups_name"',
    );

    filter.catch(exception, mockArgumentsHost);

    expect(responseStatusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(responseJson?.statusCode).toBe(500);
    expect(responseJson?.error).toBe('INTERNAL_ERROR');
    expect(responseJson?.message).toBe('حدث خطأ داخلي غير متوقع في الخادم');
    expect(responseJson?.details).toBeUndefined();
    assertCleanErrorEnvelope(responseJson!);
  });
});
