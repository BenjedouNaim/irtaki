/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testRegex: '.*\\.spec\\.(ts|tsx)$',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  passWithNoTests: true,
};
