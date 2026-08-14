/** @type {import('jest').Config} */
module.exports = {
  preset: undefined,
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.(ts|tsx)$',
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    // Path aliases matching tsconfig.json paths
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  passWithNoTests: true,
};
