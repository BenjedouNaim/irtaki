import { parsePushPayload, PUSH_EVENTS } from '../push-payload';
import { pushDestination } from '../push-destination';
import type { Role } from '@/shared/auth';

const resourceId = '019a0000-0000-7000-8000-000000000001';

describe('push validation and UF §8 routing', () => {
  it('projects valid payloads and rejects unknown events and route injection', () => {
    expect(
      parsePushPayload({ eventType: 'N-01', resourceId, name: 'private' }),
    ).toEqual({ eventType: 'N-01', resourceId });
    for (const value of [
      null,
      'N-01',
      {},
      { eventType: 'N-09', resourceId },
      { eventType: 'N-01', resourceId: '../../admin' },
    ]) {
      expect(parsePushPayload(value)).toBeNull();
    }
  });

  it.each([
    ['N-01', 'Student', '/(app)/student/daily-report/type-selection'],
    ['N-02', 'Student', '/(app)/student/weekly-report'],
    ['N-03', 'Student', '/(app)/student'],
    ['N-04', 'User', '/(app)/user'],
    ['N-05', 'Assistant', '/(app)/assistant/join-requests'],
    [
      'N-06',
      'Student',
      { pathname: '/(app)/student', params: { tab: 'payment' } },
    ],
    [
      'N-07',
      'Teacher',
      {
        pathname: '/(app)/teacher/groups/[id]/roster',
        params: { id: 'assigned-group' },
      },
    ],
    ['N-08', 'User', '/(app)/user'],
  ] as const)('maps %s for %s', async (eventType, role, destination) => {
    expect(
      await pushDestination(
        { eventType, resourceId },
        role,
        async () => 'assigned-group',
      ),
    ).toEqual(destination);
  });

  it.each(PUSH_EVENTS)(
    'never routes a User into protected role screens through %s',
    async (eventType) => {
      const resolve = jest.fn();
      expect(
        await pushDestination({ eventType, resourceId }, 'User', resolve),
      ).toBe('/(app)/user');
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it.each(['Admin', 'Assistant', 'Student'] as Role[])(
    'does not resolve a Teacher resource for %s',
    async (role) => {
      const resolve = jest.fn();
      await pushDestination({ eventType: 'N-07', resourceId }, role, resolve);
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it('falls back to Teacher Home when the resource is no longer in scope', async () => {
    expect(
      await pushDestination(
        { eventType: 'N-07', resourceId },
        'Teacher',
        async () => null,
      ),
    ).toBe('/(app)/teacher');
  });
});
