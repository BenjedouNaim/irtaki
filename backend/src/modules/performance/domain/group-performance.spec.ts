import {
  aggregateGroupPerformance,
  GroupMemberPerformance,
} from './group-performance';

function member(
  membershipId: string,
  overrides: Partial<GroupMemberPerformance> = {},
): GroupMemberPerformance {
  return {
    membershipId,
    fullName: `Student ${membershipId}`,
    commitmentScore: null,
    effectiveDays: 0,
    reportedDays: 0,
    absenceBreakdown: { sick: 0, studying: 0, other: 0 },
    ...overrides,
  };
}

describe('aggregateGroupPerformance (UC-07 steps 4–5, API-038)', () => {
  describe('the weakest-first student list (UF §17, AC-15)', () => {
    it('sorts defined scores ASCENDING — the weakest student first', () => {
      const result = aggregateGroupPerformance([
        member('b', { commitmentScore: 90 }),
        member('a', { commitmentScore: 40 }),
        member('c', { commitmentScore: 65 }),
      ]);

      expect(result.students.map((s) => s.membershipId)).toEqual([
        'a',
        'c',
        'b',
      ]);
      expect(result.students.map((s) => s.commitmentScore)).toEqual([
        40, 65, 90,
      ]);
    });

    it('places a NULL score after every defined one — null is not weak (DEC-B04)', () => {
      const result = aggregateGroupPerformance([
        member('no-data', { commitmentScore: null }),
        member('weak', { commitmentScore: 10 }),
        member('strong', { commitmentScore: 95 }),
      ]);

      expect(result.students.map((s) => s.membershipId)).toEqual([
        'weak',
        'strong',
        'no-data',
      ]);
    });

    it('breaks ties on membership_id so the order is total and stable', () => {
      const first = aggregateGroupPerformance([
        member('m2', { commitmentScore: 50 }),
        member('m1', { commitmentScore: 50 }),
      ]);
      const second = aggregateGroupPerformance([
        member('m1', { commitmentScore: 50 }),
        member('m2', { commitmentScore: 50 }),
      ]);

      expect(first.students.map((s) => s.membershipId)).toEqual(['m1', 'm2']);
      expect(second.students).toEqual(first.students);
    });

    it('carries full_name through as-is, null included', () => {
      const result = aggregateGroupPerformance([
        member('m1', { fullName: null, commitmentScore: 20 }),
      ]);

      expect(result.students).toEqual([
        { membershipId: 'm1', fullName: null, commitmentScore: 20 },
      ]);
    });
  });

  describe('commitment_average (DEC-B04, UC-07 alt. flow 5a)', () => {
    it('is the mean of the DEFINED scores, skipping the nulls', () => {
      const result = aggregateGroupPerformance([
        member('a', { commitmentScore: 40 }),
        member('b', { commitmentScore: 80 }),
        member('c', { commitmentScore: null }),
      ]);

      // 60, not 40 — a null member is never counted as a zero.
      expect(result.commitmentAverage).toBe(60);
    });

    it('is null when EVERY member score is null — "not enough data"', () => {
      const result = aggregateGroupPerformance([member('a'), member('b')]);

      expect(result.commitmentAverage).toBeNull();
    });

    it('is null for an empty member set — no zero-division artefact (alt. flow 3a)', () => {
      expect(aggregateGroupPerformance([])).toEqual({
        commitmentAverage: null,
        students: [],
        absenceBreakdown: { sick: 0, studying: 0, other: 0 },
        submissionRate: null,
      });
    });
  });

  describe('submission_rate (SAS §18.3, pooled over the member set)', () => {
    it('pools the numerators and denominators rather than averaging rates', () => {
      const result = aggregateGroupPerformance([
        // 5/5 reported.
        member('a', { effectiveDays: 5, reportedDays: 5 }),
        // 1/15 reported. A mean of rates would say 53%; the pooled rate is 30%.
        member('b', { effectiveDays: 15, reportedDays: 1 }),
      ]);

      expect(result.submissionRate).toBe(30);
    });

    it('is null when the group had no effective days at all (DEC-B04)', () => {
      const result = aggregateGroupPerformance([
        member('a', { effectiveDays: 0, reportedDays: 0 }),
      ]);

      expect(result.submissionRate).toBeNull();
    });

    it('is 0 — not null — when there were effective days and no reports', () => {
      const result = aggregateGroupPerformance([
        member('a', { effectiveDays: 6, reportedDays: 0 }),
      ]);

      expect(result.submissionRate).toBe(0);
    });
  });

  describe('absence_breakdown (UC-07 step 4, VR-19 reasons)', () => {
    it('sums each reason across the member set', () => {
      const result = aggregateGroupPerformance([
        member('a', { absenceBreakdown: { sick: 2, studying: 1, other: 0 } }),
        member('b', { absenceBreakdown: { sick: 1, studying: 0, other: 3 } }),
      ]);

      expect(result.absenceBreakdown).toEqual({
        sick: 3,
        studying: 1,
        other: 3,
      });
    });
  });
});
