import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitJoinRequestDto } from './submit-join-request.dto';

/**
 * VO-08 ApplicantProfile (DMS §8) — "the immutable snapshot of
 * applicant-declared data", validated per VR-03…09.
 *
 * The VO is embedded on E-04 JoinRequest rather than being a class of its
 * own, and its rules are split by what they can see: the *business* rules
 * that need the target Group (VR-04a cardinality, VR-06, VR-07, VR-08) are
 * enforced by `JoinRequest.submit` and covered in `join-request.entity.spec`;
 * the *shape* rules that need nothing but the payload — VR-03 "all applicant
 * profile fields are mandatory" and VR-05 "phone_number must match the
 * Tunisian format" — live on this DTO and are covered here. Together the two
 * files give every VR-03…09 rule at least one negative test.
 *
 * Mirrors app.module's ValidationPipe options (whitelist + forbidNonWhitelisted).
 */
const VALID = {
  group_id: '018f4c1e-6a2b-7c3d-8e4f-5a6b7c8d9e0f',
  full_name: 'محمد الأمين',
  gender: 'Male',
  age: 24,
  phone_number: '20123456',
  occupation: 'طالب',
  city: 'تونس',
  memorized_ahzab: [1, 2, 3, 4, 5],
  tajweed_level: 'Intermediate',
  studied_tajweed_theory: true,
  studied_qalun: false,
  fee_agreement: true,
  program_goal: 'Memorization',
};

async function fields(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(SubmitJoinRequestDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property).sort();
}

describe('SubmitJoinRequestDto — VO-08 ApplicantProfile shape rules', () => {
  it('accepts the complete, well-formed profile', async () => {
    expect(await fields(VALID)).toEqual([]);
  });

  describe('VR-03 — every applicant profile field is mandatory', () => {
    it.each([
      'group_id',
      'full_name',
      'gender',
      'age',
      'phone_number',
      'occupation',
      'city',
      'memorized_ahzab',
      'tajweed_level',
      'studied_tajweed_theory',
      'studied_qalun',
      'fee_agreement',
      'program_goal',
    ])('rejects a payload with %s missing', async (field) => {
      const body: Record<string, unknown> = { ...VALID };
      delete body[field];

      expect(await fields(body)).toContain(field);
    });

    it.each(['full_name', 'occupation', 'city'])(
      'rejects an empty %s — present but blank is still missing',
      async (field) => {
        expect(await fields({ ...VALID, [field]: '' })).toContain(field);
      },
    );

    it('rejects a full_name shorter than 3 or longer than 80 characters', async () => {
      expect(await fields({ ...VALID, full_name: 'ab' })).toContain(
        'full_name',
      );
      expect(await fields({ ...VALID, full_name: 'ن'.repeat(81) })).toContain(
        'full_name',
      );
    });

    it('rejects an empty memorized_ahzab array', async () => {
      expect(await fields({ ...VALID, memorized_ahzab: [] })).toContain(
        'memorized_ahzab',
      );
    });

    it('reports every missing field at once rather than the first', async () => {
      expect(await fields({})).toEqual(
        [
          'age',
          'city',
          'fee_agreement',
          'full_name',
          'gender',
          'group_id',
          'memorized_ahzab',
          'occupation',
          'phone_number',
          'program_goal',
          'studied_qalun',
          'studied_tajweed_theory',
          'tajweed_level',
        ].sort(),
      );
    });
  });

  describe('VR-05 — phone_number must match the Tunisian format', () => {
    it.each(['20123456', '98765432', '51000000', '+21620123456'])(
      'accepts the Tunisian number %s',
      async (phone) => {
        expect(await fields({ ...VALID, phone_number: phone })).toEqual([]);
      },
    );

    it.each([
      ['2012345', 'seven digits — one short'],
      ['201234567', 'nine digits — one too many'],
      ['10123456', 'a leading 1 is not an allocated Tunisian prefix'],
      ['00123456', 'a leading 0 is not an allocated Tunisian prefix'],
      ['+33612345678', 'a French number'],
      ['+216201234567', 'a country code with too many digits after it'],
      ['20 12 34 56', 'spaces inside the number'],
      ['20-123-456', 'punctuation inside the number'],
      ['2012345a', 'a letter among the digits'],
      ['', 'the empty string'],
    ])('rejects %s (%s)', async (phone) => {
      expect(await fields({ ...VALID, phone_number: phone })).toContain(
        'phone_number',
      );
    });
  });

  describe('the enumerated declarations (DMS §9)', () => {
    it.each(['Beginner', 'Intermediate', 'Advanced'])(
      'accepts tajweed_level %s',
      async (level) => {
        expect(await fields({ ...VALID, tajweed_level: level })).toEqual([]);
      },
    );

    it.each(['beginner', 'Expert', 'Native'])(
      'rejects tajweed_level %s — the contract is case-exact and closed',
      async (level) => {
        expect(await fields({ ...VALID, tajweed_level: level })).toContain(
          'tajweed_level',
        );
      },
    );

    it.each(['male', 'Other', 'M'])(
      'rejects gender %s outside the two documented values',
      async (gender) => {
        expect(await fields({ ...VALID, gender })).toContain('gender');
      },
    );

    it('rejects a program_goal outside the enumeration before VR-07 ever sees it', async () => {
      expect(await fields({ ...VALID, program_goal: 'Tafsir' })).toContain(
        'program_goal',
      );
    });

    it('lets program_goal=Revision through the shape check so VR-07 can answer it', async () => {
      // VR-07 wants an explanatory message, not a shape error — the rule
      // lives on the entity (join-request.entity.spec), so the transport
      // layer must not swallow the value first.
      expect(await fields({ ...VALID, program_goal: 'Revision' })).toEqual([]);
    });
  });

  describe('numeric bounds', () => {
    it.each([0, -1])('rejects age %i', async (age) => {
      expect(await fields({ ...VALID, age })).toContain('age');
    });

    it('rejects a non-integer age', async () => {
      expect(await fields({ ...VALID, age: 24.5 })).toContain('age');
    });

    it.each([0, 61, -3])(
      'rejects hizb number %i outside 1–60 (VR-04a range half)',
      async (hizb) => {
        expect(
          await fields({ ...VALID, memorized_ahzab: [1, 2, 3, 4, hizb] }),
        ).toContain('memorized_ahzab');
      },
    );

    it('rejects a non-integer hizb number', async () => {
      expect(
        await fields({ ...VALID, memorized_ahzab: [1, 2, 3, 4, 5.5] }),
      ).toContain('memorized_ahzab');
    });

    it('rejects a malformed group_id', async () => {
      expect(await fields({ ...VALID, group_id: 'not-a-uuid' })).toContain(
        'group_id',
      );
    });
  });

  it('strips a mass-assigned score — VO-08 is declared data, never client-scored (INV-09)', async () => {
    expect(await fields({ ...VALID, score: 100 })).toContain('score');
  });

  it('strips a mass-assigned status', async () => {
    expect(await fields({ ...VALID, status: 'Accepted' })).toContain('status');
  });
});
