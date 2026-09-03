/* eslint-disable @typescript-eslint/unbound-method */
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IUserRepository } from '../../domain/user.repository.interface';
import { User } from '../../domain/user.entity';
import { UserRole } from '../../domain/user-role.enum';
import type { PromotionTargetRole } from '../../domain/user-role.enum';
import { PromoteRoleUseCase } from './promote-role.use-case';

describe('PromoteRoleUseCase (UC-17, API-052)', () => {
  const ADMIN_ID = '018f3a2b-0000-7000-8000-0000000000aa';
  const TARGET_ID = '018f3a2b-0000-7000-8000-0000000000bb';

  let userRepository: jest.Mocked<IUserRepository>;
  let useCase: PromoteRoleUseCase;

  function makeUser(role: UserRole): User {
    return new User({
      id: TARGET_ID,
      email: 'target@example.com',
      passwordHash: 'hash123',
      timezone: 'Africa/Tunis',
      role,
      fullName: 'أحمد بن علي',
    });
  }

  beforeEach(() => {
    userRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findAllByRole: jest.fn(),
      save: jest.fn(),
      promoteToStudent: jest.fn(),
      demoteToUser: jest.fn(),
      promoteFromUserRole: jest.fn(),
    };
    useCase = new PromoteRoleUseCase(userRepository);
  });

  it.each<PromotionTargetRole>([UserRole.Teacher, UserRole.Assistant])(
    'promotes a User to %s and returns the updated user envelope',
    async (target) => {
      userRepository.findById.mockResolvedValue(makeUser(UserRole.User));
      userRepository.promoteFromUserRole.mockResolvedValue(true);

      const result = await useCase.execute(ADMIN_ID, TARGET_ID, target);

      expect(userRepository.promoteFromUserRole).toHaveBeenCalledWith(
        TARGET_ID,
        target,
      );
      expect(result).toEqual({
        data: {
          id: TARGET_ID,
          email: 'target@example.com',
          full_name: 'أحمد بن علي',
          role: target,
        },
      });
    },
  );

  it('returns full_name null when the target has no name yet', async () => {
    const user = new User({
      id: TARGET_ID,
      email: 'target@example.com',
      passwordHash: 'hash123',
      timezone: 'Africa/Tunis',
      role: UserRole.User,
    });
    userRepository.findById.mockResolvedValue(user);
    userRepository.promoteFromUserRole.mockResolvedValue(true);

    const result = await useCase.execute(ADMIN_ID, TARGET_ID, UserRole.Teacher);

    expect(result.data.full_name).toBeNull();
  });

  it.each([UserRole.Teacher, UserRole.Assistant, UserRole.Student])(
    'throws 422 SOURCE_ROLE_NOT_USER when the source role is %s (BR-R03)',
    async (source) => {
      userRepository.findById.mockResolvedValue(makeUser(source));

      await expect(
        useCase.execute(ADMIN_ID, TARGET_ID, UserRole.Teacher),
      ).rejects.toMatchObject({
        response: { statusCode: 422, error: 'SOURCE_ROLE_NOT_USER' },
      });
      await expect(
        useCase.execute(ADMIN_ID, TARGET_ID, UserRole.Teacher),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(userRepository.promoteFromUserRole).not.toHaveBeenCalled();
    },
  );

  it('throws 422 SOURCE_ROLE_NOT_USER when the row stopped being a User mid-flight', async () => {
    userRepository.findById.mockResolvedValue(makeUser(UserRole.User));
    userRepository.promoteFromUserRole.mockResolvedValue(false);

    await expect(
      useCase.execute(ADMIN_ID, TARGET_ID, UserRole.Assistant),
    ).rejects.toMatchObject({
      response: { statusCode: 422, error: 'SOURCE_ROLE_NOT_USER' },
    });
  });

  it('throws 403 CANNOT_PROMOTE_SELF before looking the caller up (FR-ADMIN-02)', async () => {
    await expect(
      useCase.execute(ADMIN_ID, ADMIN_ID, UserRole.Teacher),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      useCase.execute(ADMIN_ID, ADMIN_ID, UserRole.Teacher),
    ).rejects.toMatchObject({
      response: { statusCode: 403, error: 'CANNOT_PROMOTE_SELF' },
    });
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('throws 403 CANNOT_PROMOTE_SELF when the caller writes their own id in upper-case hex', async () => {
    await expect(
      useCase.execute(ADMIN_ID, ADMIN_ID.toUpperCase(), UserRole.Teacher),
    ).rejects.toMatchObject({
      response: { statusCode: 403, error: 'CANNOT_PROMOTE_SELF' },
    });
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('maps an invalid target role escaping the domain guard to 422, never 500 (TS §21)', async () => {
    userRepository.findById.mockResolvedValue(makeUser(UserRole.User));

    await expect(
      useCase.execute(
        ADMIN_ID,
        TARGET_ID,
        UserRole.Admin as unknown as PromotionTargetRole,
      ),
    ).rejects.toMatchObject({
      response: { statusCode: 422, error: 'VALIDATION_ERROR' },
    });
    expect(userRepository.promoteFromUserRole).not.toHaveBeenCalled();
  });

  it('throws 404 for a non-existent target (Admin route, SA §14)', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(ADMIN_ID, TARGET_ID, UserRole.Teacher),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws 404 for a malformed uuid without touching the repository (APIS §9.6)', async () => {
    await expect(
      useCase.execute(ADMIN_ID, 'not-a-uuid', UserRole.Teacher),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(userRepository.findById).not.toHaveBeenCalled();
  });
});
