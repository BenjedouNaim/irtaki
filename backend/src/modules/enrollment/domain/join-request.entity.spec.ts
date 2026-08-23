import { JoinRequest } from './join-request.entity';
import { JoinRequestValidationError } from './join-request.errors';

describe('JoinRequest Entity', () => {
  const validProps = {
    userId: '018f0000-0000-7000-8000-000000000001',
    groupId: '018f0000-0000-7000-8000-000000000002',
    groupGender: 'Male' as const,
    fullName: 'أحمد التونسي',
    gender: 'Male' as const,
    age: 25,
    phoneNumber: '+21620123456',
    occupation: 'مهندس',
    city: 'تونس',
    memorizedAhzab: [1, 2, 3, 4, 5],
    tajweedLevel: 'Intermediate' as const,
    studiedTajweedTheory: true,
    studiedQalun: true,
    feeAgreement: true,
    programGoal: 'Memorization',
  };

  it('successfully creates a valid JoinRequest with score calculated', () => {
    const request = JoinRequest.submit(validProps);

    expect(request.id).toBeDefined();
    expect(request.userId).toBe(validProps.userId);
    expect(request.groupId).toBe(validProps.groupId);
    expect(request.gender).toBe('Male');
    expect(request.status).toBe('Pending');
    expect(request.memorizedHizbCount).toBe(5);
    expect(request.memorizedAhzab).toEqual([1, 2, 3, 4, 5]);
    // (5/60)*50 + 15 + 10 + 15 = 4.17 + 40 = 44.17
    expect(request.score).toBe(44.17);
  });

  it('rejects with VR-04a when memorized_ahzab has fewer than 5 distinct ahzab', () => {
    expect(() =>
      JoinRequest.submit({
        ...validProps,
        memorizedAhzab: [1, 2, 3, 4], // only 4
      }),
    ).toThrow(JoinRequestValidationError);

    try {
      JoinRequest.submit({
        ...validProps,
        memorizedAhzab: [1, 2, 3, 4],
      });
    } catch (err: unknown) {
      const error = err as JoinRequestValidationError;
      expect(error.details).toContainEqual(
        expect.objectContaining({
          field: 'memorized_ahzab',
          rule: 'VR-04a',
        }),
      );
    }
  });

  it('rejects with VR-04a when duplicates reduce distinct count below 5', () => {
    expect(() =>
      JoinRequest.submit({
        ...validProps,
        memorizedAhzab: [1, 1, 2, 3, 4], // 4 distinct
      }),
    ).toThrow(JoinRequestValidationError);
  });

  it('rejects with VR-06 when fee_agreement is false', () => {
    expect(() =>
      JoinRequest.submit({
        ...validProps,
        feeAgreement: false,
      }),
    ).toThrow(JoinRequestValidationError);

    try {
      JoinRequest.submit({
        ...validProps,
        feeAgreement: false,
      });
    } catch (err: unknown) {
      const error = err as JoinRequestValidationError;
      expect(error.details).toContainEqual(
        expect.objectContaining({
          field: 'fee_agreement',
          rule: 'VR-06',
        }),
      );
    }
  });

  it('rejects with VR-07 when program_goal is Revision', () => {
    expect(() =>
      JoinRequest.submit({
        ...validProps,
        programGoal: 'Revision',
      }),
    ).toThrow(JoinRequestValidationError);

    try {
      JoinRequest.submit({
        ...validProps,
        programGoal: 'Revision',
      });
    } catch (err: unknown) {
      const error = err as JoinRequestValidationError;
      expect(error.details).toContainEqual(
        expect.objectContaining({
          field: 'program_goal',
          rule: 'VR-07',
        }),
      );
    }
  });

  it('rejects with VR-08 when applicant gender does not match group gender', () => {
    expect(() =>
      JoinRequest.submit({
        ...validProps,
        gender: 'Female',
        groupGender: 'Male',
      }),
    ).toThrow(JoinRequestValidationError);

    try {
      JoinRequest.submit({
        ...validProps,
        gender: 'Female',
        groupGender: 'Male',
      });
    } catch (err: unknown) {
      const error = err as JoinRequestValidationError;
      expect(error.details).toContainEqual(
        expect.objectContaining({
          field: 'gender',
          rule: 'VR-08',
        }),
      );
    }
  });

  it('accumulates multiple validation errors together', () => {
    try {
      JoinRequest.submit({
        ...validProps,
        memorizedAhzab: [1, 2], // VR-04a
        feeAgreement: false, // VR-06
        programGoal: 'Revision', // VR-07
        gender: 'Female', // VR-08
        groupGender: 'Male',
      });
      fail('Expected JoinRequestValidationError');
    } catch (err: unknown) {
      const error = err as JoinRequestValidationError;
      expect(error.details).toHaveLength(4);
      expect(error.details.map((d) => d.rule)).toEqual(
        expect.arrayContaining(['VR-04a', 'VR-06', 'VR-07', 'VR-08']),
      );
    }
  });
});
