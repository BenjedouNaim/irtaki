/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SubmitJoinRequestUseCase } from './submit-join-request.use-case';
import { IJoinRequestRepository } from '../../domain/join-request.repository.interface';
import { IGroupRepository } from '../../../groups/domain/group.repository.interface';
import { JoinRequest } from '../../domain/join-request.entity';
import { SubmitJoinRequestDto } from './submit-join-request.dto';
import { JoinRequestSubmittedEvent } from '../../domain/events/join-request-submitted.event';

describe('SubmitJoinRequestUseCase', () => {
  let useCase: SubmitJoinRequestUseCase;
  let mockJoinRequestRepo: jest.Mocked<IJoinRequestRepository>;
  let mockGroupRepo: jest.Mocked<IGroupRepository>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;

  const actorId = '018f0000-0000-7000-8000-000000000001';
  const groupId = '018f0000-0000-7000-8000-000000000002';

  const validDto: SubmitJoinRequestDto = {
    group_id: groupId,
    full_name: 'أحمد التونسي',
    gender: 'Male',
    age: 25,
    phone_number: '+21620123456',
    occupation: 'مهندس',
    city: 'تونس',
    memorized_ahzab: [1, 2, 3, 4, 5],
    tajweed_level: 'Intermediate',
    studied_tajweed_theory: true,
    studied_qalun: true,
    fee_agreement: true,
    program_goal: 'Memorization',
  };

  const sampleGroupRow = {
    id: groupId,
    name: 'حلقة قالون',
    gender: 'Male',
    recitation_day: 1,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    created_at: new Date(),
    teacher: { id: 'teacher-id', full_name: 'الشيخ محمد' },
    assistant: { id: 'assistant-id', full_name: 'الأستاذ علي' },
  };

  beforeEach(() => {
    mockJoinRequestRepo = {
      create: jest.fn().mockImplementation((jr: JoinRequest) =>
        Promise.resolve({
          id: jr.id,
          userId: jr.userId,
          groupId: jr.groupId,
          fullName: jr.fullName,
          gender: jr.gender,
          age: jr.age,
          phoneNumber: jr.phoneNumber,
          occupation: jr.occupation,
          city: jr.city,
          memorizedHizbCount: jr.memorizedHizbCount,
          tajweedLevel: jr.tajweedLevel,
          studiedTajweedTheory: jr.studiedTajweedTheory,
          studiedQalun: jr.studiedQalun,
          feeAgreement: jr.feeAgreement,
          programGoal: jr.programGoal,
          score: jr.score,
          status: jr.status,
          resolutionSource: jr.resolutionSource,
          reviewedAt: jr.reviewedAt,
          reviewedBy: jr.reviewedBy,
          createdAt: jr.createdAt,
          deletedAt: jr.deletedAt,
        }),
      ),
      existsPendingForUser: jest.fn().mockResolvedValue(false),
      findLatestForUser: jest.fn().mockResolvedValue(null),
      findByIdForDetail: jest.fn(),
      findPendingQueue: jest.fn(),
      acceptConditionally: jest.fn(),
      rejectConditionally: jest.fn(),
      countPendingForAssistant: jest.fn(),
    };

    mockGroupRepo = {
      findAllForList: jest.fn(),
      countAll: jest.fn(),
      findByStaffIdForList: jest.fn(),
      findByActiveMemberForList: jest.fn(),
      findAvailableForGender: jest.fn(),
      findGenderByUserId: jest.fn(),
      findByIdForDetail: jest.fn().mockResolvedValue(sampleGroupRow),
      findByActiveMemberAndGroupId: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn(),
      updateName: jest.fn(),
      updateEnrollmentStatus: jest.fn(),
      updateStaff: jest.fn(),
      updateLifecycle: jest.fn(),
      hasMembershipHistory: jest.fn(),
      hasActiveMembership: jest.fn().mockResolvedValue(false),
      deleteById: jest.fn(),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    useCase = new SubmitJoinRequestUseCase(
      mockJoinRequestRepo,
      mockGroupRepo,
      mockEventEmitter,
    );
  });

  it('submits a valid join request successfully, calculates score, and emits event', async () => {
    const result = await useCase.execute(actorId, validDto);

    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    expect(result.data.status).toBe('Pending');
    expect(result.data.score).toBe(44.17);
    expect(mockJoinRequestRepo.create).toHaveBeenCalledTimes(1);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      JoinRequestSubmittedEvent.EVENT_NAME,
      expect.objectContaining({
        joinRequestId: result.data.id,
        groupId,
        applicantId: actorId,
        score: 44.17,
      }),
    );
  });

  it('throws 409 GROUP_UNAVAILABLE if group does not exist', async () => {
    mockGroupRepo.findByIdForDetail.mockResolvedValueOnce(null);

    await expect(useCase.execute(actorId, validDto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws 409 GROUP_UNAVAILABLE if group enrollment_status is Closed', async () => {
    mockGroupRepo.findByIdForDetail.mockResolvedValueOnce({
      ...sampleGroupRow,
      enrollment_status: 'Closed',
    });

    await expect(useCase.execute(actorId, validDto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws 409 GROUP_UNAVAILABLE if group lifecycle_state is Archived', async () => {
    mockGroupRepo.findByIdForDetail.mockResolvedValueOnce({
      ...sampleGroupRow,
      lifecycle_state: 'Archived',
    });

    await expect(useCase.execute(actorId, validDto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws 409 DUPLICATE_JOIN_REQUEST if user already has a Pending join request', async () => {
    mockJoinRequestRepo.existsPendingForUser.mockResolvedValueOnce(true);

    await expect(useCase.execute(actorId, validDto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws 409 DUPLICATE_JOIN_REQUEST if user already has an Active membership', async () => {
    mockGroupRepo.hasActiveMembership.mockResolvedValueOnce(true);

    await expect(useCase.execute(actorId, validDto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws 422 VALIDATION_ERROR if domain validation fails (e.g. gender mismatch)', async () => {
    mockGroupRepo.findByIdForDetail.mockResolvedValueOnce({
      ...sampleGroupRow,
      gender: 'Female', // group is female, but applicant is male
    });

    await expect(useCase.execute(actorId, validDto)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('handles DB unique index race (23505) gracefully by remapping to 409', async () => {
    mockJoinRequestRepo.create.mockRejectedValueOnce({
      code: '23505',
      detail: 'Key (user_id)=(...) already exists in DB-UQ-03',
    });

    await expect(useCase.execute(actorId, validDto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('does not fail request if event emission throws', async () => {
    mockEventEmitter.emit.mockImplementationOnce(() => {
      throw new Error('Event emitter error');
    });

    const result = await useCase.execute(actorId, validDto);
    expect(result.data.status).toBe('Pending');
  });
});
