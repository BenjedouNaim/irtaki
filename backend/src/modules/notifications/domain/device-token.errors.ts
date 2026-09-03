/** One APIS §9.5 `details[]` entry produced by the domain layer. */
export interface DeviceTokenValidationErrorDetail {
  field: string;
  rule: string;
  message: string;
}

/**
 * Raised when a DeviceToken (E-09) cannot be constructed because the
 * registration payload violates the entity's own rules — the platform is
 * not one of the two DBT-14 CHECK values, or the token is blank.
 * Mapped to `422 VALIDATION_ERROR` with field-level `details` (TS §21, §29).
 */
export class DeviceTokenValidationError extends Error {
  public readonly details: DeviceTokenValidationErrorDetail[];

  constructor(details: DeviceTokenValidationErrorDetail[]) {
    super('فشل التحقق من صحة بيانات الجهاز');
    this.name = 'DeviceTokenValidationError';
    this.details = details;
  }
}
