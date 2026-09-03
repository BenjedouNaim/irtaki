/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ListGroupsUseCase } from './list-groups.use-case';
import {
  GROUP_REPOSITORY,
  IGroupRepository,
  GroupListRow,
} from '../../domain/group.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';

describe('ListGroupsUseCase', () => {
  let useCase: ListGroupsUseCase;
  let groupRepository: jest.Mocked<IGroupRepository>;

  const mockGroupRow: GroupListRow = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'حلقة الإمام قالون',
    gender: 'Male',
    recitation_day: 5,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    created_at: new Date('2026-08-20T10:00:00Z'),
    teacher: {
      id: '22222222-2222-2222-2222-222222222222',
      full_name: 'الشيخ محمد',
    },
    assistant: {
      id: '33333333-3333-3333-3333-333333333333',
      full_name: 'الأستاذ أحمد',
    },
  };

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<IGroupRepository>> = {
      findAllForList: jest.fn(),
      countAll: jest.fn(),
      findByStaffIdForList: jest.fn(),
      findByActiveMemberForList: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListGroupsUseCase,
        {
          provide: GROUP_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile();

    useCase = module.get<ListGroupsUseCase>(ListGroupsUseCase);
    groupRepository = module.get(GROUP_REPOSITORY);
  });

  it('should return all groups with full DTO for Admin', async () => {
    groupRepository.findAllForList.mockResolvedValue([mockGroupRow]);

    const result = await useCase.execute('admin-id', UserRole.Admin);

    expect(groupRepository.findAllForList).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      data: [
        {
          id: mockGroupRow.id,
          name: mockGroupRow.name,
          gender: mockGroupRow.gender,
          recitation_day: mockGroupRow.recitation_day,
          enrollment_status: mockGroupRow.enrollment_status,
          lifecycle_state: mockGroupRow.lifecycle_state,
          teacher: {
            id: mockGroupRow.teacher.id,
            full_name: mockGroupRow.teacher.full_name,
          },
          assistant: {
            id: mockGroupRow.assistant.id,
            full_name: mockGroupRow.assistant.full_name,
          },
        },
      ],
    });
  });

  it('should return assigned groups with full DTO for Teacher', async () => {
    groupRepository.findByStaffIdForList.mockResolvedValue([mockGroupRow]);

    const result = await useCase.execute('teacher-id', UserRole.Teacher);

    expect(groupRepository.findByStaffIdForList).toHaveBeenCalledWith(
      'teacher-id',
    );
    expect(result).toEqual({
      data: [
        {
          id: mockGroupRow.id,
          name: mockGroupRow.name,
          gender: mockGroupRow.gender,
          recitation_day: mockGroupRow.recitation_day,
          enrollment_status: mockGroupRow.enrollment_status,
          lifecycle_state: mockGroupRow.lifecycle_state,
          teacher: {
            id: mockGroupRow.teacher.id,
            full_name: mockGroupRow.teacher.full_name,
          },
          assistant: {
            id: mockGroupRow.assistant.id,
            full_name: mockGroupRow.assistant.full_name,
          },
        },
      ],
    });
  });

  it('should return assigned groups with full DTO for Assistant', async () => {
    groupRepository.findByStaffIdForList.mockResolvedValue([mockGroupRow]);

    const result = await useCase.execute('assistant-id', UserRole.Assistant);

    expect(groupRepository.findByStaffIdForList).toHaveBeenCalledWith(
      'assistant-id',
    );
    expect(result.data).toHaveLength(1);
  });

  it('should return limited DTO for Student with active membership', async () => {
    groupRepository.findByActiveMemberForList.mockResolvedValue(mockGroupRow);

    const result = await useCase.execute('student-id', UserRole.Student);

    expect(groupRepository.findByActiveMemberForList).toHaveBeenCalledWith(
      'student-id',
    );
    expect(result).toEqual({
      data: [
        {
          id: mockGroupRow.id,
          name: mockGroupRow.name,
          recitation_day: mockGroupRow.recitation_day,
          enrollment_status: mockGroupRow.enrollment_status,
        },
      ],
    });
    // Ensure limited shape does not include staff or internal lifecycle/gender
    expect(result.data[0]).not.toHaveProperty('teacher');
    expect(result.data[0]).not.toHaveProperty('assistant');
    expect(result.data[0]).not.toHaveProperty('gender');
    expect(result.data[0]).not.toHaveProperty('lifecycle_state');
  });

  it('should return empty data array for Student with no active membership', async () => {
    groupRepository.findByActiveMemberForList.mockResolvedValue(null);

    const result = await useCase.execute('student-id', UserRole.Student);

    expect(groupRepository.findByActiveMemberForList).toHaveBeenCalledWith(
      'student-id',
    );
    expect(result).toEqual({ data: [] });
  });

  it('should return empty data array for User without calling repository', async () => {
    const result = await useCase.execute('user-id', UserRole.User);

    expect(groupRepository.findAllForList).not.toHaveBeenCalled();
    expect(groupRepository.findByStaffIdForList).not.toHaveBeenCalled();
    expect(groupRepository.findByActiveMemberForList).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [] });
  });
});
