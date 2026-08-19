export interface ApiErrorDetail {
  field: string;
  rule?: string;
  message: string;
}

export interface ApiErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
  details?: ApiErrorDetail[];
  correlationId?: string;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: ApiErrorDetail[];
  public readonly correlationId?: string;

  constructor(envelope: ApiErrorEnvelope) {
    super(envelope.message);
    this.name = 'ApiError';
    this.statusCode = envelope.statusCode;
    this.errorCode = envelope.error;
    this.details = envelope.details;
    this.correlationId = envelope.correlationId;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network connection failed') {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  skipAuth?: boolean;
}
