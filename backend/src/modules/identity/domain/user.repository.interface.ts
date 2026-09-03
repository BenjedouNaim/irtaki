import { EntityManager } from 'typeorm';
import { User } from './user.entity';
import { PromotionTargetRole, UserRole } from './user-role.enum';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findAllByRole(role?: UserRole): Promise<User[]>;
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
