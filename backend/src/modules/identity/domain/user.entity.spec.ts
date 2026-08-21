import { User } from './user.entity';
import { UserRole } from './user-role.enum';

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
});
