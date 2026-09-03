/** One APIS §9.5 `details[]` entry produced by the domain layer. */
export interface NotificationPreferenceValidationErrorDetail {
  field: string;
  rule: string;
  message: string;
}

/**
 * BR-61 / VR-38 — an account-critical notification category (N-03 join
 * accepted, N-04 join rejected, N-08 removed from group; every row whose
 * `notification_categories.is_mutable` is `false`) may not be muted.
 *
 * Raised by the E-10 entity, mapped by the use case to
 * `422 ACCOUNT_CRITICAL_CATEGORY` (APIS §10.12). The same rule is enforced a
 * second time at the storage layer by DB-CHK-09's trigger, which is the
 * backstop, not the primary control (SAS §12 UC-18 E1: "blocked
 * server-side, not merely hidden in the UI", NFR-08).
 */
export class AccountCriticalCategoryError extends Error {
  public readonly category: string;

  constructor(category: string) {
    super('هذه الفئة حساسة للحساب ولا يمكن كتمها');
    this.name = 'AccountCriticalCategoryError';
    this.category = category;
  }
}

/**
 * The `category` in the request body names no row in `notification_categories`
 * (DBT-15). A field-level validation failure, so `422 VALIDATION_ERROR` with
 * `details` (APIS §9.5/§9.6), not a `404` — the addressed resource is the
 * caller's own preference collection, which always exists.
 */
export class UnknownNotificationCategoryError extends Error {
  public readonly details: NotificationPreferenceValidationErrorDetail[];

  constructor(category: string) {
    super('فشل التحقق من صحة البيانات المدخلة');
    this.name = 'UnknownNotificationCategoryError';
    this.details = [
      {
        field: 'category',
        rule: 'DBT-15',
        message: `فئة الإشعارات "${category}" غير معروفة`,
      },
    ];
  }
}
