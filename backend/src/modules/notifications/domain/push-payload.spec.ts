import {
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventType,
} from './notification-event';
import {
  PUSH_PAYLOAD_FIELDS,
  buildPushPayload,
  type PushPayload,
} from './push-payload';

describe('PushPayload (BR-46 / FR-NOTIF-07 / SAS §22.4)', () => {
  it('carries exactly two fields, on EVERY event type, with no exceptions', () => {
    for (const eventType of NOTIFICATION_EVENT_TYPES) {
      const payload = buildPushPayload({
        eventType,
        resourceId: '0191f0a0-0000-7000-8000-000000000001',
      });

      expect(Object.keys(payload).sort()).toEqual(
        [...PUSH_PAYLOAD_FIELDS].sort(),
      );
      expect(Object.keys(payload)).toHaveLength(2);
    }
  });

  it('projects away anything a caller carries alongside the two fields', () => {
    // A widened value: the compiler refuses the object literal directly
    // (`OnlyPushPayload` maps every extra key to `never`), so the only way
    // to reach this at all is a cast — and the factory still strips it.
    const smuggled = {
      eventType: 'N-07' as NotificationEventType,
      resourceId: 'membership-1',
      fullName: 'فاطمة',
      commitmentScore: 91,
      amount: 30,
    } as unknown as PushPayload;

    const payload = buildPushPayload(smuggled);

    expect(Object.keys(payload)).toEqual(['eventType', 'resourceId']);
    expect(JSON.stringify(payload)).not.toContain('فاطمة');
    expect(JSON.stringify(payload)).not.toContain('91');
    expect(JSON.stringify(payload)).not.toContain('30');
  });

  it('is frozen, so nothing can be attached after construction', () => {
    const payload = buildPushPayload({
      eventType: 'N-01',
      resourceId: 'membership-1',
    });

    expect(Object.isFrozen(payload)).toBe(true);
    expect(() => {
      (payload as unknown as Record<string, unknown>).score = 42;
    }).toThrow(TypeError);
    expect(Object.keys(payload)).toHaveLength(2);
  });

  it('serialises to JSON with the two fields only — what crosses EXT-03', () => {
    const payload = buildPushPayload({
      eventType: 'N-06',
      resourceId: 'membership-9',
    });

    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      eventType: 'N-06',
      resourceId: 'membership-9',
    });
  });
});
