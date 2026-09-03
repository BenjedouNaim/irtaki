/**
 * Raised when a promotion targets an account whose current role is not
 * exactly `User` (BR-R03, SAS §UC-17 E1). Mapped by the application layer to
 * `422 SOURCE_ROLE_NOT_USER` (APIS §10.13). Because `User` is the only
 * accepted source role, no Teacher/Assistant/Student/Admin account can ever
 * change role through this path — demotion is structurally impossible
 * (ISS-03).
 */
export class SourceRoleNotUserError extends Error {
  constructor(
    message = 'لا يمكن ترقية هذا الحساب لأن دوره الحالي ليس "مستخدم"',
  ) {
    super(message);
    this.name = 'SourceRoleNotUserError';
  }
}

/**
 * Raised when the requested target role is not one of the two roles BR-R03
 * allows a User to be promoted to (`Teacher`, `Assistant`). Transport-level
 * validation catches this first; the domain guard is the second layer so the
 * rule holds for any caller of `User.promoteTo` (AGENTS §10).
 */
export class InvalidPromotionTargetRoleError extends Error {
  constructor(message = 'الدور المحدد غير صالح للترقية') {
    super(message);
    this.name = 'InvalidPromotionTargetRoleError';
  }
}
