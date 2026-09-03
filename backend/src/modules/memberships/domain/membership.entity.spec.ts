import { Membership } from './membership.entity';

/**
 * E-03 Membership — the AGG-03 root. Framework-free (TS §9): this file
 * imports the entity and nothing else, no Nest testing module, no TypeORM.
 */
describe('Membership (E-03, AGG-03)', () => {
  const base = {
    userId: 'user-1',
    groupId: 'group-1',
    joinRequestId: 'jr-1',
    timezone: 'Africa/Tunis',
  };

  describe('INV-27 — started_at is dated in the member’s own timezone', () => {
    it('takes the calendar date of the member’s timezone, not the server’s UTC date', () => {
      // 2026-03-05T23:30Z is already 2026-03-06 in Africa/Tunis (UTC+1).
      const membership = Membership.createFromAcceptance({
        ...base,
        createdAt: new Date('2026-03-05T23:30:00Z'),
      });

      expect(membership.startedAt).toBe('2026-03-06');
    });

    it('is still on the previous day for a member behind UTC at the same instant', () => {
      // The same instant is 2026-03-05 in America/New_York (UTC−5).
      const membership = Membership.createFromAcceptance({
        ...base,
        timezone: 'America/New_York',
        createdAt: new Date('2026-03-05T23:30:00Z'),
      });

      expect(membership.startedAt).toBe('2026-03-05');
    });

    it('dates two members accepted at the same instant differently (ADR-030)', () => {
      const at = new Date('2026-03-05T23:30:00Z');

      const tunis = Membership.createFromAcceptance({ ...base, createdAt: at });
      const honolulu = Membership.createFromAcceptance({
        ...base,
        timezone: 'Pacific/Honolulu',
        createdAt: at,
      });

      expect(tunis.startedAt).toBe('2026-03-06');
      expect(honolulu.startedAt).toBe('2026-03-05');
    });

    it('lets an explicit started_at win over the derived date', () => {
      const membership = Membership.createFromAcceptance({
        ...base,
        startedAt: '2026-01-01',
        createdAt: new Date('2026-03-05T23:30:00Z'),
      });

      expect(membership.startedAt).toBe('2026-01-01');
    });

    it('emits a zero-padded YYYY-MM-DD, the DBD DATE shape', () => {
      const membership = Membership.createFromAcceptance({
        ...base,
        createdAt: new Date('2026-01-02T12:00:00Z'),
      });

      expect(membership.startedAt).toBe('2026-01-02');
      expect(membership.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('INV-19 — a new Membership carries no history forward', () => {
    it('starts Active with no end bound and no terminator (DEC-C02, BR-40)', () => {
      const membership = Membership.createFromAcceptance(base);

      expect(membership.state).toBe('Active');
      expect(membership.endedAt).toBeNull();
      expect(membership.endedBy).toBeNull();
    });

    it('gives a rejoining User a brand-new identity, sharing nothing with the prior episode', () => {
      const first = Membership.createFromAcceptance({
        ...base,
        joinRequestId: 'jr-1',
        startedAt: '2025-01-01',
      });
      const rejoin = Membership.createFromAcceptance({
        ...base,
        joinRequestId: 'jr-2',
        startedAt: '2026-01-01',
      });

      expect(rejoin.id).not.toBe(first.id);
      expect(rejoin.userId).toBe(first.userId);
      expect(rejoin.startedAt).toBe('2026-01-01');
      expect(rejoin.joinRequestId).toBe('jr-2');
      // Nothing on the entity can express carried-forward coverage or
      // history: the only state it holds is this episode's own.
      expect(rejoin.endedAt).toBeNull();
    });

    it('traces to exactly one JoinRequest — DS-01 is the only creation path (R-05)', () => {
      expect(Membership.createFromAcceptance(base).joinRequestId).toBe('jr-1');
    });
  });

  describe('INV-20 — Terminated is terminal, and unreachable from the entity', () => {
    it('exposes no revive, terminate or reactivate transition (ST-03)', () => {
      const membership = Membership.createFromAcceptance(base);
      const surface = [
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(membership)),
        ...Object.getOwnPropertyNames(membership),
      ];

      for (const forbidden of [
        'revive',
        'reactivate',
        'restore',
        'terminate',
        'setState',
      ]) {
        expect(surface).not.toContain(forbidden);
      }
    });

    it('has no writable state property — state is read-only on the instance', () => {
      const membership = Membership.createFromAcceptance(base);
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(membership),
        'state',
      );

      expect(typeof descriptor?.get).toBe('function');
      expect(typeof descriptor?.set).toBe('undefined');
    });
  });

  describe('identity and timestamps', () => {
    it('mints a fresh uuid per instance when none is supplied', () => {
      const a = Membership.createFromAcceptance(base);
      const b = Membership.createFromAcceptance(base);

      expect(a.id).not.toBe(b.id);
      expect(a.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('honours a supplied id', () => {
      expect(
        Membership.createFromAcceptance({ ...base, id: 'fixed-id' }).id,
      ).toBe('fixed-id');
    });

    it('keeps created_at as the technical instant, distinct from the started_at date (DBD §133)', () => {
      const at = new Date('2026-03-05T23:30:00Z');
      const membership = Membership.createFromAcceptance({
        ...base,
        createdAt: at,
      });

      expect(membership.createdAt).toEqual(at);
      expect(membership.updatedAt).toEqual(at);
      expect(membership.startedAt).toBe('2026-03-06');
    });
  });
});
