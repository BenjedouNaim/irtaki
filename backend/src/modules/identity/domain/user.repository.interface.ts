import { EntityManager } from 'typeorm';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';

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
}
