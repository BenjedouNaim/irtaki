import { User } from './user.entity';
import { PROMOTION_TARGET_ROLES, UserRole } from './user-role.enum';
import type { PromotionTargetRole } from './user-role.enum';
import {
  InvalidPromotionTargetRoleError,
  SourceRoleNotUserError,
} from './user.errors';

describe('User Domain Entity', () => {
  it('instantiates with default role User and normalized lowercase email', () => {
    const user = new User({
      email: ' Test@Example.COM ',
      passwordHash: 'hash123',
      timezone: 'Africa/Tunis',
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.role).toBe(UserRole.User);
    expect(user.fullName).toBeNull();
    expect(user.gender).toBeNull();
    expect(user.timezone).toBe('Africa/Tunis');
    expect(user.mustChangePassword).toBe(false);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('updates timezone and updates timestamp', () => {
    const user = new User({
      email: 'user@example.com',
      passwordHash: 'hash123',
      timezone: 'Africa/Tunis',
    });

    user.updateTimezone('UTC');
    expect(user.timezone).toBe('UTC');
  });

  it('updates password hash and updatedAt timestamp', () => {
    const user = new User({
      email: 'user@example.com',
      passwordHash: 'oldHash',
      timezone: 'Africa/Tunis',
    });

    const previousUpdatedAt = user.updatedAt;
    user.updatePassword('newHash456');

    expect(user.passwordHash).toBe('newHash456');
    expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(
      previousUpdatedAt.getTime(),
    );
  });

  describe('promoteTo (UC-17, BR-R03)', () => {
    function makeUser(role: UserRole): User {
      return new User({
        email: 'promotable@example.com',
        passwordHash: 'hash123',
        timezone: 'Africa/Tunis',
        role,
      });
    }

    it.each<PromotionTargetRole>([UserRole.Teacher, UserRole.Assistant])(
      'promotes a User to %s and bumps updatedAt',
      (target) => {
        const user = makeUser(UserRole.User);
        const previousUpdatedAt = user.updatedAt;

        user.promoteTo(target);

        expect(user.role).toBe(target);
        expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(
          previousUpdatedAt.getTime(),
        );
      },
    );

    it.each([
      UserRole.Teacher,
      UserRole.Assistant,
      UserRole.Student,
      UserRole.Admin,
    ])('refuses %s as a source role, so demotion is impossible', (source) => {
      const user = makeUser(source);

      expect(() => user.promoteTo(UserRole.Assistant)).toThrow(
        SourceRoleNotUserError,
      );
      expect(user.role).toBe(source);
    });

    it.each([UserRole.Admin, UserRole.Student, UserRole.User])(
      'refuses %s as a promotion target role',
      (target) => {
        const user = makeUser(UserRole.User);

        expect(() =>
          user.promoteTo(target as unknown as UserRole.Teacher),
        ).toThrow(InvalidPromotionTargetRoleError);
        expect(user.role).toBe(UserRole.User);
      },
    );
  });
  describe('INV-01 — a User holds exactly one role at any time (BR-R01)', () => {
    it('carries a single scalar role, never a collection', () => {
      const user = new User({
        email: 'one@example.com',
        passwordHash: 'hash123',
        timezone: 'Africa/Tunis',
        role: UserRole.Teacher,
      });

      expect(typeof user.role).toBe('string');
      expect(Array.isArray(user.role)).toBe(false);
      expect(Object.values(UserRole)).toContain(user.role);
    });

    it('replaces the role on promotion rather than adding one', () => {
      const user = new User({
        email: 'one@example.com',
        passwordHash: 'hash123',
        timezone: 'Africa/Tunis',
      });

      user.promoteTo(UserRole.Teacher);

      expect(user.role).toBe(UserRole.Teacher);
      expect(user.role).not.toBe(UserRole.User);
    });

    it('exposes no setter for the role — promoteTo is the only transition', () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(
          new User({
            email: 'one@example.com',
            passwordHash: 'hash123',
            timezone: 'Africa/Tunis',
          }),
        ),
        'role',
      );

      expect(typeof descriptor?.get).toBe('function');
      expect(typeof descriptor?.set).toBe('undefined');
    });
  });

  describe('INV-02 — the Admin is a singleton the domain cannot mint (BR-R05, DEC-C07)', () => {
    it('keeps Admin out of the promotion target set (DB-UQ-08 guards the row)', () => {
      expect(PROMOTION_TARGET_ROLES).toEqual([
        UserRole.Teacher,
        UserRole.Assistant,
      ]);
      expect(PROMOTION_TARGET_ROLES).not.toContain(UserRole.Admin);
    });

    it('refuses to promote anyone to Admin, so no second Admin can appear', () => {
      const user = new User({
        email: 'aspirant@example.com',
        passwordHash: 'hash123',
        timezone: 'Africa/Tunis',
      });

      expect(() =>
        user.promoteTo(UserRole.Admin as unknown as UserRole.Teacher),
      ).toThrow(InvalidPromotionTargetRoleError);
      expect(user.role).toBe(UserRole.User);
    });

    it('refuses Admin as a source role, so the Admin cannot demote itself', () => {
      const admin = new User({
        email: 'admin@example.com',
        passwordHash: 'hash123',
        timezone: 'Africa/Tunis',
        role: UserRole.Admin,
      });

      expect(() => admin.promoteTo(UserRole.Teacher)).toThrow(
        SourceRoleNotUserError,
      );
      expect(admin.role).toBe(UserRole.Admin);
    });
  });

  describe('INV-07 — staff cannot be demoted (BR-44)', () => {
    it.each([UserRole.Teacher, UserRole.Assistant])(
      'gives %s no transition back to User — demotion is structurally absent, not merely unimplemented',
      (staffRole) => {
        const staff = new User({
          email: 'staff@example.com',
          passwordHash: 'hash123',
          timezone: 'Africa/Tunis',
          role: staffRole,
        });
        const surface = Object.getOwnPropertyNames(
          Object.getPrototypeOf(staff),
        );

        expect(surface).not.toContain('demoteTo');
        expect(surface).not.toContain('demote');
        expect(surface).not.toContain('setRole');
        expect(() => staff.promoteTo(UserRole.Teacher)).toThrow(
          SourceRoleNotUserError,
        );
        expect(staff.role).toBe(staffRole);
      },
    );
  });

  describe('INV-25 — role change history is not tracked (BR-R04, DEC-D05)', () => {
    it('overwrites the role in place, keeping no previous value anywhere on the entity', () => {
      const user = new User({
        email: 'historyless@example.com',
        passwordHash: 'hash123',
        timezone: 'Africa/Tunis',
      });

      user.promoteTo(UserRole.Assistant);

      const serialised = JSON.stringify(
        Object.getOwnPropertyNames(user).reduce<Record<string, unknown>>(
          (acc, key) => {
            acc[key] = (user as unknown as Record<string, unknown>)[key];
            return acc;
          },
          {},
        ),
      );

      expect(serialised).not.toContain(UserRole.User);
      expect(user.role).toBe(UserRole.Assistant);
    });

    it('carries no history collection — the deliberate absence DQ-07 resolved', () => {
      const user = new User({
        email: 'historyless@example.com',
        passwordHash: 'hash123',
        timezone: 'Africa/Tunis',
      });
      const surface = [
        ...Object.getOwnPropertyNames(user),
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(user)),
      ];

      for (const forbidden of [
        'roleHistory',
        '_roleHistory',
        'previousRole',
        '_previousRole',
        'roleChanges',
      ]) {
        expect(surface).not.toContain(forbidden);
      }
    });
  });

  describe('INV-27 — the timezone is the User’s own day-boundary authority', () => {
    it('is required at construction, never defaulted by the entity', () => {
      const user = new User({
        email: 'tz@example.com',
        passwordHash: 'hash123',
        timezone: 'Pacific/Honolulu',
      });

      expect(user.timezone).toBe('Pacific/Honolulu');
    });

    it('survives a promotion — changing role never resets the day boundary', () => {
      const user = new User({
        email: 'tz@example.com',
        passwordHash: 'hash123',
        timezone: 'Pacific/Honolulu',
      });

      user.promoteTo(UserRole.Teacher);

      expect(user.timezone).toBe('Pacific/Honolulu');
    });
  });
});
