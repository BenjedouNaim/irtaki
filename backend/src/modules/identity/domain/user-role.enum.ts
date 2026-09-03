export enum UserRole {
  Admin = 'Admin',
  User = 'User',
  Student = 'Student',
  Teacher = 'Teacher',
  Assistant = 'Assistant',
}

/**
 * The only two roles a `User` may be promoted to (BR-R03, APIS §10.13
 * `PATCH /users/{id}/role`). Deliberately not the full `UserRole` set — the
 * promotion path never produces `Admin` (INV-02/DB-UQ-08 keep the Admin
 * singleton) nor `Student` (that transition belongs to DS-01 acceptance).
 */
export type PromotionTargetRole = UserRole.Teacher | UserRole.Assistant;

export const PROMOTION_TARGET_ROLES: PromotionTargetRole[] = [
  UserRole.Teacher,
  UserRole.Assistant,
];
