export interface DomainValidationErrorDetail {
  field: string;
  rule: string;
  message: string;
}

export class JoinRequestValidationError extends Error {
  public readonly details: DomainValidationErrorDetail[];

  constructor(details: DomainValidationErrorDetail[]) {
    super('فشل التحقق من صحة بيانات طلب الانضمام');
    this.name = 'JoinRequestValidationError';
    this.details = details;
  }
}
