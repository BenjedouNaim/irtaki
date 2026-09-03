import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  FindUsersPageParams,
  IUserRepository,
  UserDirectoryPage,
  UserRoleCounts,
} from '../domain/user.repository.interface';
import { User } from '../domain/user.entity';
import { PromotionTargetRole, UserRole } from '../domain/user-role.enum';
import { UserTypeOrmEntity } from './user.typeorm-entity';

/** One raw `users` row of the directory projection (API-053). */
interface RawUserDirectoryRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

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

  async findPageByRole(
    params: FindUsersPageParams,
  ): Promise<UserDirectoryPage> {
    // One literal parameterised statement (TS §36): the optional role filter
    // and the optional keyset position are nullable parameters rather than
    // appended SQL. `created_at DESC, id DESC` is the fixed order APIS §9.4
    // pins to `/users`; the id tie-break (UUIDv7, time-ordered) is what makes
    // the cursor stable when two accounts share a `created_at`. The sort key
    // is projected as a full-precision ISO instant so the cursor compares
    // exactly what was ordered by. `LIMIT limit + 1` derives `hasMore`
    // without a COUNT (APIS §9.1).
    const rows = await this.repo.manager.query<RawUserDirectoryRow[]>(
      `SELECT u.id,
              u.email,
              u.full_name,
              u.role,
              to_char(u.created_at AT TIME ZONE 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
         FROM users u
        WHERE ($1::text IS NULL OR u.role = $1::text)
          AND ($2::timestamptz IS NULL
               OR u.created_at < $2::timestamptz
               OR (u.created_at = $2::timestamptz AND u.id < $3::uuid))
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT $4`,
      [
        params.role,
        params.cursor?.sortKey.createdAt ?? null,
        params.cursor?.id ?? null,
        params.limit + 1,
      ],
    );

    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    return {
      rows: page.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        role: row.role as UserRole,
        createdAt: row.created_at,
      })),
      hasMore,
    };
  }

  /**
   * API-009's Admin population tiles. ONE literal statement, one pass over
   * `users`, grouped by the role column — the table is bounded by the
   * center's own membership and there is no DB-IDX for a role count in
   * DBD §23, so no index is invented here for it (DBD's index set is
   * closed: "every index traces to a named read path").
   */
  async countByRole(): Promise<UserRoleCounts> {
    const rows = await this.repo.manager.query<
      Array<{ role: string; count: number }>
    >(`SELECT u.role, COUNT(*)::int AS count FROM users u GROUP BY u.role`);

    const counts: UserRoleCounts = {};
    for (const row of rows) {
      counts[row.role as UserRole] = row.count;
    }
    return counts;
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

  async promoteFromUserRole(
    userId: string,
    role: PromotionTargetRole,
  ): Promise<boolean> {
    const rows: Array<{ id: string }> = await this.repo.query(
      `UPDATE users
       SET role = $2,
           updated_at = now()
       WHERE id = $1
         AND role = 'User'
       RETURNING id`,
      [userId, role],
    );
    return rows.length > 0;
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
