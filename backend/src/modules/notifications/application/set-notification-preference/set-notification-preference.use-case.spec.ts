import { UnprocessableEntityException } from '@nestjs/common';
import { SetNotificationPreferenceUseCase } from './set-notification-preference.use-case';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: Array<{ field: string; rule: string; message: string }>;
}

function bodyOf(error: unknown): ErrorBody {
  return (error as UnprocessableEntityException).getResponse() as ErrorBody;
}

describe('SetNotificationPreferenceUseCase (F-NOT-04 / API-051)', () => {
  const repository = {
    findCatalogForUser: jest.fn(),
    findCategoryByCode: jest.fn(),
    upsert: jest.fn(),
  };
  const useCase = new SetNotificationPreferenceUseCase(repository);

  beforeEach(() => jest.clearAllMocks());

  describe('a mutable category', () => {
    beforeEach(() => {
      repository.findCategoryByCode.mockResolvedValue({
        code: 'N-01',
        description: 'Daily report not yet submitted',
        isMutable: true,
      });
    });

    it('persists the caller from the JWT and answers with the stored state', async () => {
      repository.upsert.mockResolvedValue(true);

      const result = await useCase.execute('user-1', {
        category: 'N-01',
        muted: true,
      });

      expect(repository.upsert).toHaveBeenCalledTimes(1);
      expect(repository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          category: 'N-01',
          muted: true,
        }),
      );
      expect(result).toEqual({
        data: {
          category: 'N-01',
          description: 'Daily report not yet submitted',
          is_mutable: true,
          muted: true,
        },
      });
    });

    it('unmutes just as readily', async () => {
      repository.upsert.mockResolvedValue(false);

      const result = await useCase.execute('user-1', {
        category: 'N-01',
        muted: false,
      });

      expect(result.data.muted).toBe(false);
    });

    it('reports the state the DATABASE stored, not the state requested', async () => {
      repository.upsert.mockResolvedValue(false);

      const result = await useCase.execute('user-1', {
        category: 'N-01',
        muted: true,
      });

      expect(result.data.muted).toBe(false);
    });
  });

  describe('an account-critical category (VR-38 / BR-61)', () => {
    beforeEach(() => {
      repository.findCategoryByCode.mockResolvedValue({
        code: 'N-03',
        description: 'Join request accepted',
        isMutable: false,
      });
    });

    it('answers 422 ACCOUNT_CRITICAL_CATEGORY and writes nothing', async () => {
      await expect(
        useCase.execute('user-1', { category: 'N-03', muted: true }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('carries the APIS §9.5 error envelope in Arabic', async () => {
      try {
        await useCase.execute('user-1', { category: 'N-03', muted: true });
        fail('expected UnprocessableEntityException');
      } catch (error) {
        const body = bodyOf(error);
        expect(body.statusCode).toBe(422);
        expect(body.error).toBe('ACCOUNT_CRITICAL_CATEGORY');
        expect(body.message).toBe('هذه الفئة حساسة للحساب ولا يمكن كتمها');
      }
    });

    // "enforced server-side regardless of what the client sends" — the
    // decision is read from `notification_categories`, so an unmute of an
    // immutable category is refused with the same answer.
    it('refuses an unmute of the same category', async () => {
      await expect(
        useCase.execute('user-1', { category: 'N-03', muted: false }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('reads is_mutable from the catalogue, not from the request', async () => {
      await expect(
        useCase.execute('user-1', {
          category: 'N-03',
          muted: true,
          // A smuggled flag cannot reach the decision: the DTO strips it and
          // the use case never looks at the body for mutability.
          ...({ is_mutable: true } as object),
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('a category the catalogue does not hold', () => {
    it('answers 422 VALIDATION_ERROR with a field-level detail', async () => {
      repository.findCategoryByCode.mockResolvedValue(null);

      try {
        await useCase.execute('user-1', { category: 'N-99', muted: true });
        fail('expected UnprocessableEntityException');
      } catch (error) {
        const body = bodyOf(error);
        expect(body.statusCode).toBe(422);
        expect(body.error).toBe('VALIDATION_ERROR');
        expect(body.details).toEqual([
          {
            field: 'category',
            rule: 'DBT-15',
            message: 'فئة الإشعارات "N-99" غير معروفة',
          },
        ]);
      }
      expect(repository.upsert).not.toHaveBeenCalled();
    });
  });
});
