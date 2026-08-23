import {
  listGroups,
  listAvailableGroups,
  getGroupDetail,
  updateGroupName,
  toggleEnrollment,
  ListGroupsResponse,
  GroupDetailResponse,
} from '../groups.client';
import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('groups.client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call apiClient.get with /groups', async () => {
    const mockResponse: ListGroupsResponse = {
      data: [
        {
          id: 'group-1',
          name: 'حلقة قالون',
          gender: 'Male',
          recitation_day: 3,
          enrollment_status: 'Open',
          lifecycle_state: 'Active',
          teacher: { id: 'teacher-1', full_name: 'أستاذ أحمد' },
          assistant: { id: 'assistant-1', full_name: 'مساعد علي' },
        },
      ],
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const result = await listGroups();

    expect(apiClient.get).toHaveBeenCalledWith('/groups');
    expect(result).toEqual(mockResponse);
  });

  it('should call apiClient.get with /groups/available and gender query param', async () => {
    const mockResponse: ListGroupsResponse = {
      data: [
        {
          id: 'group-2',
          name: 'حلقة قالون 2',
          recitation_day: 4,
          enrollment_status: 'Open',
        },
      ],
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const result = await listAvailableGroups('Male');

    expect(apiClient.get).toHaveBeenCalledWith('/groups/available', {
      params: { gender: 'Male' },
    });
    expect(result).toEqual(mockResponse);
  });

  it('should call apiClient.get with /groups/:id', async () => {
    const mockResponse: GroupDetailResponse = {
      data: {
        id: 'group-1',
        name: 'حلقة قالون',
        gender: 'Male',
        recitation_day: 3,
        enrollment_status: 'Open',
        lifecycle_state: 'Active',
        teacher: { id: 'teacher-1', full_name: 'أستاذ أحمد' },
        assistant: { id: 'assistant-1', full_name: 'مساعد علي' },
      },
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const result = await getGroupDetail('group-1');

    expect(apiClient.get).toHaveBeenCalledWith('/groups/group-1');
    expect(result).toEqual(mockResponse);
  });

  it('should call apiClient.patch with /groups/:id and payload for updateGroupName', async () => {
    const mockResponse: GroupDetailResponse = {
      data: {
        id: 'group-1',
        name: 'حلقة قالون الجديدة',
        gender: 'Male',
        recitation_day: 3,
        enrollment_status: 'Open',
        lifecycle_state: 'Active',
        teacher: { id: 'teacher-1', full_name: 'أستاذ أحمد' },
        assistant: { id: 'assistant-1', full_name: 'مساعد علي' },
      },
    };

    (apiClient.patch as jest.Mock).mockResolvedValue(mockResponse);

    const result = await updateGroupName('group-1', {
      name: 'حلقة قالون الجديدة',
    });

    expect(apiClient.patch).toHaveBeenCalledWith('/groups/group-1', {
      name: 'حلقة قالون الجديدة',
    });
    expect(result).toEqual(mockResponse);
  });

  it('should call apiClient.patch with /groups/:id/enrollment and payload for toggleEnrollment', async () => {
    const mockResponse: GroupDetailResponse = {
      data: {
        id: 'group-1',
        name: 'حلقة قالون',
        gender: 'Male',
        recitation_day: 3,
        enrollment_status: 'Closed',
        lifecycle_state: 'Active',
        teacher: { id: 'teacher-1', full_name: 'أستاذ أحمد' },
        assistant: { id: 'assistant-1', full_name: 'مساعد علي' },
      },
    };

    (apiClient.patch as jest.Mock).mockResolvedValue(mockResponse);

    const result = await toggleEnrollment('group-1', {
      enrollment_status: 'Closed',
    });

    expect(apiClient.patch).toHaveBeenCalledWith('/groups/group-1/enrollment', {
      enrollment_status: 'Closed',
    });
    expect(result).toEqual(mockResponse);
  });
});
