/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('react-native-worklets', () => {
  return require('react-native-worklets/lib/module/mock.js');
});

jest.mock('react-native-reanimated', () => {
  const reanimated = require('react-native-reanimated/mock');
  return reanimated;
});
