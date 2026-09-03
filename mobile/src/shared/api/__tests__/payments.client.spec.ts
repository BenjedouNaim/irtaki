import { getMyPayments, PaymentLedgerDto } from '../payments.client';
import { apiClient } from '../client';

jest.mock('../client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockLedger: PaymentLedgerDto = {
  cycles: [
    {
      index: 0,
      start_date: '2026-01-15',
      end_date: '2026-04-14',
      status: 'Paid',
      paid_at: '2026-02-03T09:30:00.000Z',
    },
    {
      index: 1,
      start_date: '2026-04-15',
      end_date: '2026-07-14',
      status: 'Unpaid',
    },
  ],
  next_due_date: '2026-07-14',
  arrears_count: 0,
};

describe('payments.client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyPayments', () => {
    it('calls apiClient.get with /me/payments and unwraps the APIS §9.1 envelope', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockLedger });

      const result = await getMyPayments();

      expect(apiClient.get).toHaveBeenCalledWith('/me/payments');
      expect(result).toEqual(mockLedger);
    });

    it('keeps paid_at absent on a cycle that carries no PaymentRecord', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockLedger });

      const result = await getMyPayments();

      expect(result.cycles[1]).not.toHaveProperty('paid_at');
      expect(result.cycles[0].paid_at).toBe('2026-02-03T09:30:00.000Z');
    });

    it('passes a null next_due_date through untouched (never defaulted)', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: { ...mockLedger, next_due_date: null },
      });

      const result = await getMyPayments();

      expect(result.next_due_date).toBeNull();
    });

    it('propagates apiClient errors unchanged', async () => {
      const error = new Error('boom');
      (apiClient.get as jest.Mock).mockRejectedValue(error);

      await expect(getMyPayments()).rejects.toBe(error);
    });
  });
});
