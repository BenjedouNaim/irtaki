import {
  submitJoinRequest,
  SubmitJoinRequestPayload,
  SubmitJoinRequestResponse,
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
});
