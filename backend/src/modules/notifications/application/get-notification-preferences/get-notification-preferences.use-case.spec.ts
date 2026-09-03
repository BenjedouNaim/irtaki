import { GetNotificationPreferencesUseCase } from './get-notification-preferences.use-case';

describe('GetNotificationPreferencesUseCase (F-NOT-03 / API-050)', () => {
  const repository = {
    findCatalogForUser: jest.fn(),
    findCategoryByCode: jest.fn(),
    upsert: jest.fn(),
  };
  const useCase = new GetNotificationPreferencesUseCase(repository);

  beforeEach(() => jest.clearAllMocks());

  it('asks the repository for the caller from the JWT, never a body id', async () => {
    repository.findCatalogForUser.mockResolvedValue([]);

    await useCase.execute('user-1');

    expect(repository.findCatalogForUser).toHaveBeenCalledTimes(1);
    expect(repository.findCatalogForUser).toHaveBeenCalledWith('user-1');
  });

  it('maps every merged record onto the APIS §10.12 wire shape', async () => {
    repository.findCatalogForUser.mockResolvedValue([
      {
        code: 'N-01',
        description: 'Daily report not yet submitted',
        isMutable: true,
        muted: true,
      },
      {
        code: 'N-03',
        description: 'Join request accepted',
        isMutable: false,
        muted: false,
      },
    ]);

    const result = await useCase.execute('user-1');

    expect(result).toEqual({
      data: [
        {
          category: 'N-01',
          description: 'Daily report not yet submitted',
          is_mutable: true,
          muted: true,
        },
        {
          category: 'N-03',
          description: 'Join request accepted',
          is_mutable: false,
          muted: false,
        },
      ],
    });
  });

  it('never drops an account-critical category from the catalogue', async () => {
    repository.findCatalogForUser.mockResolvedValue([
      { code: 'N-03', description: 'x', isMutable: false, muted: false },
      { code: 'N-04', description: 'x', isMutable: false, muted: false },
      { code: 'N-08', description: 'x', isMutable: false, muted: false },
    ]);

    const result = await useCase.execute('user-1');

    expect(result.data.map((row) => row.category)).toEqual([
      'N-03',
      'N-04',
      'N-08',
    ]);
    expect(result.data.every((row) => row.is_mutable === false)).toBe(true);
  });

  it('returns the repository order untouched — no re-sorting, no filtering', async () => {
    repository.findCatalogForUser.mockResolvedValue(
      ['N-01', 'N-02', 'N-03'].map((code) => ({
        code,
        description: code,
        isMutable: true,
        muted: false,
      })),
    );

    const result = await useCase.execute('user-1');

    expect(result.data.map((row) => row.category)).toEqual([
      'N-01',
      'N-02',
      'N-03',
    ]);
  });

  it('does not merge in application code — one repository call, no others', async () => {
    repository.findCatalogForUser.mockResolvedValue([]);

    await useCase.execute('user-1');

    expect(repository.findCategoryByCode).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
