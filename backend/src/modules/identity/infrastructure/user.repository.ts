import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { IUserRepository } from '../domain/user.repository.interface';
import { User } from '../domain/user.entity';
import { UserRole } from '../domain/user-role.enum';
import { UserTypeOrmEntity } from './user.typeorm-entity';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserTypeOrmEntity)
    private readonly repo: Repository<UserTypeOrmEntity>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    const entity = await this.repo.findOne({ where: { email: normalized } });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findById(id: string): Promise<User | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findAllByRole(role?: UserRole): Promise<User[]> {
    const entities = await this.repo.find({
      where: role ? { role } : {},
      order: { createdAt: 'ASC' },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async save(user: User): Promise<User> {
    const entity = this.toEntity(user);
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async promoteToStudent(
    userId: string,
    fullName: string,
    gender: 'Male' | 'Female',
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE users
       SET role = 'Student',
           full_name = $2,
           gender = $3,
           updated_at = now()
       WHERE id = $1`,
      [userId, fullName, gender],
    );
  }

  async demoteToUser(userId: string, manager: EntityManager): Promise<void> {
    await manager.query(
      `UPDATE users
       SET role = 'User',
           updated_at = now()
       WHERE id = $1`,
      [userId],
    );
  }

  private toDomain(entity: UserTypeOrmEntity): User {
    return new User({
      id: entity.id,
      email: entity.email,
      passwordHash: entity.passwordHash,
      role: entity.role as UserRole,
      fullName: entity.fullName,
      gender: entity.gender as 'Male' | 'Female' | null,
      timezone: entity.timezone,
      mustChangePassword: entity.mustChangePassword,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  private toEntity(domain: User): UserTypeOrmEntity {
    const entity = new UserTypeOrmEntity();
    entity.id = domain.id;
    entity.email = domain.email;
    entity.passwordHash = domain.passwordHash;
    entity.role = domain.role;
    entity.fullName = domain.fullName;
    entity.gender = domain.gender;
    entity.timezone = domain.timezone;
    entity.mustChangePassword = domain.mustChangePassword;
    entity.createdAt = domain.createdAt;
    entity.updatedAt = domain.updatedAt;
    return entity;
  }
}
