import { listGroups, ListGroupsResponse } from '../groups.client';
import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
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
});
