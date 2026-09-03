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
  describe('VR-04a — the upper half of the 5..60 cardinality band', () => {
    it('accepts the full 60 ahzab', () => {
      const all = Array.from({ length: 60 }, (_, i) => i + 1);
      const request = JoinRequest.submit({
        ...validProps,
        memorizedAhzab: all,
      });

      expect(request.memorizedHizbCount).toBe(60);
      // (60/60)*50 + 15 + 10 + 15 = 90
      expect(request.score).toBe(90);
    });

    it.each([
      [[0, 1, 2, 3, 4], 'a hizb below 1'],
      [[1, 2, 3, 4, 61], 'a hizb above 60'],
      [[1, 2, 3, 4, -5], 'a negative hizb'],
      [[1, 2, 3, 4, 5.5], 'a fractional hizb'],
    ])('rejects %j — %s', (ahzab) => {
      expect(() =>
        JoinRequest.submit({ ...validProps, memorizedAhzab: ahzab }),
      ).toThrow(JoinRequestValidationError);
    });

    it('normalises the declared set — distinct, ascending, defensively copied', () => {
      const request = JoinRequest.submit({
        ...validProps,
        memorizedAhzab: [9, 3, 9, 1, 7, 3, 5],
      });

      expect(request.memorizedAhzab).toEqual([1, 3, 5, 7, 9]);
      expect(request.memorizedHizbCount).toBe(5);

      const handed = request.memorizedAhzab;
      handed.push(60);
      expect(request.memorizedAhzab).toEqual([1, 3, 5, 7, 9]);
    });
  });

  describe('INV-09 — the score is immutable once computed (BR-38)', () => {
    it('exposes a getter and no setter for the score', () => {
      const request = JoinRequest.submit(validProps);
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(request),
        'score',
      );

      expect(typeof descriptor?.get).toBe('function');
      expect(typeof descriptor?.set).toBe('undefined');
    });

    it('offers no recompute or rescore transition on the surface', () => {
      const request = JoinRequest.submit(validProps);
      const surface = [
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(request)),
        ...Object.getOwnPropertyNames(request),
      ];

      for (const forbidden of [
        'setScore',
        'recomputeScore',
        'rescore',
        'updateScore',
      ]) {
        expect(surface).not.toContain(forbidden);
      }
    });

    it('ignores a client-supplied score — it is derived, never accepted', () => {
      const request = JoinRequest.submit({
        ...validProps,
        score: 100,
      } as unknown as Parameters<typeof JoinRequest.submit>[0]);

      expect(request.score).toBe(44.17);
    });

    it('is a snapshot: the same declaration always yields the same number', () => {
      expect(JoinRequest.submit(validProps).score).toBe(
        JoinRequest.submit(validProps).score,
      );
    });
  });

  describe('ST-04 — a request is born Pending and unreviewed', () => {
    it('starts Pending with no reviewer, no decision and no soft delete', () => {
      const request = JoinRequest.submit(validProps);

      expect(request.status).toBe('Pending');
      expect(request.reviewedAt).toBeNull();
      expect(request.reviewedBy).toBeNull();
      expect(request.resolutionSource).toBeNull();
      expect(request.deletedAt).toBeNull();
    });

    it('offers no accept/reject transition on the entity — DS-01 owns acceptance', () => {
      const request = JoinRequest.submit(validProps);
      const surface = Object.getOwnPropertyNames(
        Object.getPrototypeOf(request),
      );

      for (const forbidden of ['accept', 'reject', 'reopen', 'setStatus']) {
        expect(surface).not.toContain(forbidden);
      }
    });
  });

  it('trims the declared free-text fields', () => {
    const request = JoinRequest.submit({
      ...validProps,
      fullName: '  أحمد التونسي  ',
      phoneNumber: ' +21620123456 ',
      occupation: ' مهندس ',
      city: ' تونس ',
    });

    expect(request.fullName).toBe('أحمد التونسي');
    expect(request.phoneNumber).toBe('+21620123456');
    expect(request.occupation).toBe('مهندس');
    expect(request.city).toBe('تونس');
  });
});
