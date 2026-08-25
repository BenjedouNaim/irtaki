/* eslint-disable @typescript-eslint/unbound-method */
import {
  IMembershipRepository,
  OwnActiveMembershipRecord,
} from '../../domain/membership.repository.interface';
import { GetOwnMembershipUseCase } from './get-own-membership.use-case';

describe('GetOwnMembershipUseCase', () => {
  let useCase: GetOwnMembershipUseCase;
  let membershipRepository: jest.Mocked<IMembershipRepository>;

  const activeMembership: OwnActiveMembershipRecord = {
    id: 'membership-1',
    group: {
      id: 'group-1',
      name: 'Test Group',
      recitationDay: 4,
      enrollmentStatus: 'Closed',
    },
    startedAt: '2026-08-01',
    state: 'Active',
  };

  beforeEach(() => {
    membershipRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
    };
    useCase = new GetOwnMembershipUseCase(membershipRepository);
  });

  it('returns the active membership in the API-025 response shape', async () => {
    membershipRepository.findActiveByUserId.mockResolvedValue(activeMembership);

    await expect(useCase.execute('student-1')).resolves.toEqual({
      data: {
        id: 'membership-1',
        group: {
          id: 'group-1',
          name: 'Test Group',
          recitation_day: 4,
          enrollment_status: 'Closed',
        },
        started_at: '2026-08-01',
        state: 'Active',
      },
    });
    expect(membershipRepository.findActiveByUserId).toHaveBeenCalledWith(
      'student-1',
    );
  });

  it('throws NOT_FOUND when the student has no active membership', async () => {
    membershipRepository.findActiveByUserId.mockResolvedValue(null);

    await expect(useCase.execute('student-1')).rejects.toMatchObject({
      response: {
        statusCode: 404,
        error: 'NOT_FOUND',
      },
    });
  });
});
