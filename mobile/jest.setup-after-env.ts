import { configure } from '@testing-library/react-native';

// Async queries (`findBy*`, `waitFor`) default to a 1s timeout; under a full
// parallel run this machine's first render of a screen can exceed it, so
// pre-existing specs time out spuriously. A longer ceiling never makes a
// failing assertion pass — it only stops load-dependent flakiness.
configure({ asyncUtilTimeout: 5000 });
