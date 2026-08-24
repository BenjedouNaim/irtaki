import {
  submitJoinRequest,
  getMyJoinRequest,
  listPendingJoinRequests,
  getJoinRequestDetail,
  acceptJoinRequest,
  SubmitJoinRequestPayload,
  SubmitJoinRequestResponse,
  ListPendingJoinRequestsResponse,
} from '../joinRequests.client';

import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('joinRequests.client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call apiClient.post with /join-requests and provided payload', async () => {
    const payload: SubmitJoinRequestPayload = {
      group_id: 'group-uuid',
      full_name: 'أحمد التونسي',
      gender: 'Male',
      age: 25,
      phone_number: '+21698123456',
      occupation: 'مهندس',
      city: 'تونس',
      memorized_ahzab: [1, 2, 3, 4, 5],
      tajweed_level: 'Intermediate',
      studied_tajweed_theory: true,
      studied_qalun: true,
      fee_agreement: true,
      program_goal: 'Memorization',
    };

    const mockResponse: SubmitJoinRequestResponse = {
      data: {
        id: 'request-uuid',
        status: 'Pending',
        score: 44.17,
        created_at: '2026-08-23T15:00:00.000Z',
      },
    };

    (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

    const result = await submitJoinRequest(payload);

    expect(apiClient.post).toHaveBeenCalledWith('/join-requests', payload);
    expect(result).toEqual(mockResponse);
  });

  it('should call apiClient.get with /join-requests/mine for getMyJoinRequest', async () => {
    const mockResponse = {
      data: {
        status: 'Pending' as const,
      },
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const result = await getMyJoinRequest();

    expect(apiClient.get).toHaveBeenCalledWith('/join-requests/mine');
    expect(result).toEqual(mockResponse);
  });

  it('should call apiClient.get with /join-requests and status=pending for listPendingJoinRequests', async () => {
    const mockResponse: ListPendingJoinRequestsResponse = {
      data: [
        {
          id: 'jr-1',
          full_name: 'أحمد التونسي',
          score: 95.0,
          created_at: '2026-08-23T10:00:00.000Z',
        },
      ],
      pagination: {
        next_cursor: 'cursor-abc',
        has_more: true,
      },
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const result = await listPendingJoinRequests({
      cursor: 'prev-cursor',
      limit: 10,
    });

    expect(apiClient.get).toHaveBeenCalledWith('/join-requests', {
      params: {
        status: 'pending',
        cursor: 'prev-cursor',
        limit: 10,
      },
    });
    expect(result).toEqual(mockResponse);
  });

  it('should call apiClient.get with /join-requests/:id for getJoinRequestDetail', async () => {
    const mockResponse = {
      data: {
        id: 'jr-123',
        full_name: 'أحمد التونسي',
        gender: 'Male',
        age: 25,
        phone_number: '+21698123456',
        occupation: 'مهندس',
        city: 'تونس',
        memorized_ahzab: [1, 2, 3, 4, 5],
        tajweed_level: 'Intermediate',
        studied_tajweed_theory: true,
        studied_qalun: true,
        fee_agreement: true,
        program_goal: 'Memorization',
        score: 85.5,
        status: 'Pending',
        created_at: '2026-08-23T10:00:00.000Z',
      },
    };

    (apiClient.get as jest.Mock).mockResolvedValue(mockResponse);

    const result = await getJoinRequestDetail('jr-123');

    expect(apiClient.get).toHaveBeenCalledWith('/join-requests/jr-123');
    expect(result).toEqual(mockResponse);
  });

  it('should call apiClient.post with /join-requests/:id/accept for acceptJoinRequest', async () => {
    const mockResponse = {
      data: {
        membership_id: 'mem-123',
      },
    };

    (apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

    const result = await acceptJoinRequest('jr-123');

    expect(apiClient.post).toHaveBeenCalledWith('/join-requests/jr-123/accept');
    expect(result).toEqual(mockResponse);
  });
});
