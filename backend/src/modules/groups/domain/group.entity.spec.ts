import { Group } from './group.entity';
import type { CreateGroupProps } from './group.entity';

/**
 * E-02 Group. Framework-free (TS §9) — the entity and nothing else.
 */
describe('Group (E-02, AGG-02)', () => {
  const base: CreateGroupProps = {
    name: 'حلقة الفجر',
    gender: 'Male',
    recitationDay: 5,
    teacherId: 'teacher-1',
    assistantId: 'assistant-1',
    createdBy: 'admin-1',
  };

  describe('INV-05 — recitation_day is immutable after creation (BR-12, VR-25)', () => {
    it('exposes a getter and no setter, so the day cannot be reassigned', () => {
      const group = new Group(base);
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(group),
        'recitationDay',
      );

      expect(group.recitationDay).toBe(5);
      expect(typeof descriptor?.get).toBe('function');
      expect(typeof descriptor?.set).toBe('undefined');
    });

    it('offers no mutator for the recitation day anywhere on the surface', () => {
      const group = new Group(base);
      const surface = [
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(group)),
        ...Object.getOwnPropertyNames(group),
      ];

      for (const forbidden of [
        'setRecitationDay',
        'changeRecitationDay',
        'updateRecitationDay',
      ]) {
        expect(surface).not.toContain(forbidden);
      }
    });

    it('is equally immutable for gender, the other write-once structural fact', () => {
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(new Group(base)),
        'gender',
      );

      expect(typeof descriptor?.set).toBe('undefined');
    });

    it.each([1, 2, 3, 4, 5, 6, 7])(
      'carries ISO-8601 day %i through unchanged (DBD DBT-02)',
      (day) => {
        expect(new Group({ ...base, recitationDay: day }).recitationDay).toBe(
          day,
        );
      },
    );
  });

  describe('INV-04 — exactly one Teacher and exactly one Assistant (BR-07, VR-23)', () => {
    it('requires both ids at construction and keeps them distinct fields', () => {
      const group = new Group(base);

      expect(group.teacherId).toBe('teacher-1');
      expect(group.assistantId).toBe('assistant-1');
    });

    it('holds one id per role — there is no collection of staff to grow', () => {
      const group = new Group(base);

      expect(typeof group.teacherId).toBe('string');
      expect(typeof group.assistantId).toBe('string');
      expect(Array.isArray(group.teacherId)).toBe(false);
      expect(Array.isArray(group.assistantId)).toBe(false);
    });

    it('leaves the VR-24 "correctly-roled" half to the application layer', () => {
      // The entity cannot see `users.role`; DMS §15 puts that check on
      // CreateGroupUseCase / DS-08 ReassignStaffUseCase, which own the two
      // user rows. Constructing with an arbitrary id therefore succeeds —
      // documenting the boundary, not a hole.
      expect(
        () => new Group({ ...base, teacherId: 'someone-unvetted' }),
      ).not.toThrow();
    });
  });

  describe('ST-02 — two orthogonal state axes (DMS §13, DBD §123)', () => {
    it('creates a group Closed to applications, per FR-GRP-01 / UC-10 step 3', () => {
      expect(new Group(base).enrollmentStatus).toBe('Closed');
    });

    it('creates a group Active, unarchived, with no archived_at', () => {
      const group = new Group(base);

      expect(group.lifecycleState).toBe('Active');
      expect(group.archivedAt).toBeNull();
    });

    it.each(['Open', 'Closed'] as const)(
      'rehydrates enrollment status %s verbatim',
      (status) => {
        expect(
          new Group({ ...base, enrollmentStatus: status }).enrollmentStatus,
        ).toBe(status);
      },
    );

    it.each(['Active', 'Archived'] as const)(
      'rehydrates lifecycle state %s verbatim',
      (state) => {
        expect(
          new Group({ ...base, lifecycleState: state }).lifecycleState,
        ).toBe(state);
      },
    );

    it('keeps the two axes independent — Archived does not rewrite enrollment_status', () => {
      const group = new Group({
        ...base,
        enrollmentStatus: 'Open',
        lifecycleState: 'Archived',
        archivedAt: new Date('2026-02-01T00:00:00Z'),
      });

      // INV-21's "accepts no new applications" is enforced by the read path
      // (SubmitJoinRequestUseCase requires lifecycle_state = Active), not by
      // collapsing the stored columns — DBD §123 is explicit about that.
      expect(group.enrollmentStatus).toBe('Open');
      expect(group.lifecycleState).toBe('Archived');
    });
  });

  describe('construction', () => {
    it('trims the surrounding whitespace off the name', () => {
      expect(new Group({ ...base, name: '  حلقة النور  ' }).name).toBe(
        'حلقة النور',
      );
    });

    it('mints a fresh uuid per instance and honours a supplied one', () => {
      const a = new Group(base);
      const b = new Group(base);

      expect(a.id).not.toBe(b.id);
      expect(new Group({ ...base, id: 'fixed' }).id).toBe('fixed');
    });

    it('records who created it', () => {
      expect(new Group(base).createdBy).toBe('admin-1');
    });
  });
});
