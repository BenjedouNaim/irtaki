import { calculateApplicantScore } from './applicant-score';

describe('calculateApplicantScore (SAS §18.6 formula)', () => {
  it('calculates minimum score (5 ahzab, Beginner, no theory, no qalun) = 9.17', () => {
    const score = calculateApplicantScore({
      memorizedAhzabCount: 5,
      tajweedLevel: 'Beginner',
      studiedTajweedTheory: false,
      studiedQalun: false,
    });
    // (5/60)*50 + 5 + 0 + 0 = 4.1666... + 5 = 9.1666... -> 9.17
    expect(score).toBe(9.17);
  });

  it('calculates maximum score (60 ahzab, Advanced, theory, qalun) = 100.00', () => {
    const score = calculateApplicantScore({
      memorizedAhzabCount: 60,
      tajweedLevel: 'Advanced',
      studiedTajweedTheory: true,
      studiedQalun: true,
    });
    // (60/60)*50 + 25 + 10 + 15 = 50 + 25 + 10 + 15 = 100.00
    expect(score).toBe(100.0);
  });

  it('calculates intermediate score accurately', () => {
    const score = calculateApplicantScore({
      memorizedAhzabCount: 30, // (30/60)*50 = 25
      tajweedLevel: 'Intermediate', // 15
      studiedTajweedTheory: true, // 10
      studiedQalun: false, // 0
    });
    // 25 + 15 + 10 + 0 = 50.00
    expect(score).toBe(50.0);
  });

  it('calculates score with Qalun bonus without theory', () => {
    const score = calculateApplicantScore({
      memorizedAhzabCount: 15, // (15/60)*50 = 12.5
      tajweedLevel: 'Beginner', // 5
      studiedTajweedTheory: false, // 0
      studiedQalun: true, // 15
    });
    // 12.5 + 5 + 0 + 15 = 32.50
    expect(score).toBe(32.5);
  });
});
