import {
  getGroupMemberships,
  GetGroupMembershipsResponse,
  RosterEntry,
} from '../memberships.client';
import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('memberships.client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRosterEntries: RosterEntry[] = [
    {
      id: 'membership-1',
      user: { id: 'user-1', full_name: 'محمد بن علي', gender: 'Male' },
      started_at: '2026-01-15T00:00:00.000Z',
      state: 'Active',
    },
    {
      id: 'membership-2',
      user: { id: 'user-2', full_name: 'فاطمة بن صالح', gender: 'Female' },
      started_at: '2025-09-01T00:00:00.000Z',
      state: 'Terminated',
    },
  ];

  it('should call apiClient.get with /groups/:id/memberships and return the response passthrough', async () => {
    const mockResponse: GetGroupMembershipsResponse = {
      data: mockRosterEntries,
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const result = await getGroupMemberships('group-1');

    expect(apiClient.get).toHaveBeenCalledWith('/groups/group-1/memberships');
    expect(result).toEqual(mockResponse);
  });

  it('should pass the as_of param through options.params when provided', async () => {
    const mockResponse: GetGroupMembershipsResponse = {
      data: mockRosterEntries,
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const result = await getGroupMemberships('group-1', {
      as_of: '2026-08-26',
    });

    expect(apiClient.get).toHaveBeenCalledWith('/groups/group-1/memberships', {
      params: { as_of: '2026-08-26' },
    });
    expect(result).toEqual(mockResponse);
  });

  it('should omit params entirely when as_of is undefined', async () => {
    const mockResponse: GetGroupMembershipsResponse = { data: [] };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    await getGroupMemberships('group-1', { as_of: undefined });

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith('/groups/group-1/memberships');
  });
});
