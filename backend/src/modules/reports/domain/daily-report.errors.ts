/** One APIS §9.5 `details[]` entry produced by the domain layer. */
export interface DailyReportValidationErrorDetail {
  field: string;
  rule: string;
  message: string;
}

/**
 * Raised when a DailyReport (E-05) cannot be constructed because its
 * type/field combination violates SAS §15.3 (VR-13…VR-20, VR-14a, BR-52).
 * Mapped to `422 VALIDATION_ERROR` with field-level `details` (TS §21, §29).
 */
export class DailyReportValidationError extends Error {
  public readonly details: DailyReportValidationErrorDetail[];

  constructor(details: DailyReportValidationErrorDetail[]) {
    super('فشل التحقق من صحة بيانات التقرير اليومي');
    this.name = 'DailyReportValidationError';
    this.details = details;
  }
}
