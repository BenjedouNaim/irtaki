import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetPreferenceDto } from './set-preference.dto';

/** Mirrors app.module's ValidationPipe options (whitelist + forbidNonWhitelisted). */
async function fields(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(SetPreferenceDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property);
}

describe('SetPreferenceDto (transport layer, APIS §10.12)', () => {
  it.each([true, false])('accepts { category, muted: %p }', async (muted) => {
    expect(await fields({ category: 'N-01', muted })).toEqual([]);
  });

  it.each([undefined, '', null, 42])(
    'rejects the category %p',
    async (category) => {
      expect(await fields({ category, muted: true })).toEqual(['category']);
    },
  );

  it.each([undefined, null, 'true', 1])(
    'rejects the muted value %p — booleans only',
    async (muted) => {
      expect(await fields({ category: 'N-01', muted })).toEqual(['muted']);
    },
  );

  // The catalogue lives in `notification_categories` (DBT-15), so the DTO
  // does not freeze a code list; an unknown code is refused a layer later.
  it('leaves an unknown category code to the application layer', async () => {
    expect(await fields({ category: 'N-99', muted: true })).toEqual([]);
  });

  it('strips a smuggled is_mutable — VR-38 is never client-decided', async () => {
    expect(
      await fields({ category: 'N-03', muted: true, is_mutable: true }),
    ).toEqual(['is_mutable']);
  });

  it('strips a smuggled user_id (AGENTS §11 mass-assignment rule)', async () => {
    expect(
      await fields({ category: 'N-01', muted: true, user_id: 'someone-else' }),
    ).toEqual(['user_id']);
  });
});
