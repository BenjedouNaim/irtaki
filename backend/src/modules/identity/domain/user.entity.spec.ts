import { User } from './user.entity';
import { UserRole } from './user-role.enum';
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
});
