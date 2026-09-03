import { EntityManager } from 'typeorm';
import { User } from './user.entity';
import { PromotionTargetRole, UserRole } from './user-role.enum';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * One row of the user directory (API-053). Deliberately not the `User`
 * entity: a list read needs neither the password hash nor the rest of the
 * account state, and `createdAt` travels as the projected sort-key string
 * (ISO-8601 UTC, microsecond precision) rather than a `Date`, because the
 * keyset cursor must compare exactly what the database ordered by.
 */
export interface UserDirectoryRecord {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  createdAt: string;
}

/** Keyset position in `created_at DESC, id DESC` (APIS §9.2/§9.4). */
export interface UsersCursor {
  id: string;
  sortKey: { createdAt: string };
}

export interface FindUsersPageParams {
  /** APIS §9.3 `role` filter; `null` = the unfiltered, all-roles directory. */
  role: UserRole | null;
  limit: number;
  cursor: UsersCursor | null;
}

export interface UserDirectoryPage {
  rows: UserDirectoryRecord[];
  hasMore: boolean;
}

/**
 * How many accounts hold each role — the input to API-009's Admin
 * `staff_count` and `student_count` tiles (APIS §10.3). A role with no
 * account is simply absent from the map; the caller reads a missing role as
 * zero, which is a genuine count and not a defaulted unknown (DEC-B04).
 */
export type UserRoleCounts = Partial<Record<UserRole, number>>;

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /**
   * API-053 — one page of the user directory, `created_at DESC` (APIS §9.4),
   * optionally narrowed to a single role for the staff-assignment picker
   * (F-GRP-04). `hasMore` comes from reading one row past `limit`, never a
   * `COUNT(*)` (APIS §9.1: no totals on any collection).
   */
  findPageByRole(params: FindUsersPageParams): Promise<UserDirectoryPage>;
  /**
   * API-009's two Admin population tiles, from ONE `GROUP BY role` pass over
   * `users` — never one `COUNT(*)` per role, and never a page of the
   * cursor-paginated directory measured by its length (APIS §9.1 puts no
   * total on any collection, so a page cannot answer this).
   */
  countByRole(): Promise<UserRoleCounts>;
  save(user: User): Promise<User>;
  promoteToStudent(
    userId: string,
    fullName: string,
    gender: 'Male' | 'Female',
    manager: EntityManager,
  ): Promise<void>;
  demoteToUser(userId: string, manager: EntityManager): Promise<void>;
  /**
   * Conditional promotion (BR-R03): flips `users.role` only while the row
   * still holds `role = 'User'`. Returns false when the guard did not match,
   * which the use case maps to `422 SOURCE_ROLE_NOT_USER` — this is what
   * keeps a concurrent acceptance/promotion from widening the transition
   * without any row locking (TS §20).
   */
  promoteFromUserRole(
    userId: string,
    role: PromotionTargetRole,
  ): Promise<boolean>;
}
