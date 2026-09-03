import { NotificationPreference } from './notification-preference.entity';
import { AccountCriticalCategoryError } from './notification-preference.errors';

const MUTABLE = { code: 'N-01', description: 'x', isMutable: true };
const CRITICAL = { code: 'N-03', description: 'x', isMutable: false };

describe('NotificationPreference (E-10, DMS §7 / SAS §20)', () => {
  describe('a mutable category', () => {
    it.each([true, false])('accepts muted=%p', (muted) => {
      const preference = NotificationPreference.set({
        userId: 'user-1',
        category: MUTABLE,
        muted,
      });

      expect(preference.userId).toBe('user-1');
      expect(preference.category).toBe('N-01');
      expect(preference.muted).toBe(muted);
    });

    it('carries the category CODE, not the whole catalogue row', () => {
      const preference = NotificationPreference.set({
        userId: 'user-1',
        category: MUTABLE,
        muted: true,
      });

      expect(preference.category).toBe(MUTABLE.code);
    });

    it('is frozen — a preference is a value (TS §9)', () => {
      const preference = NotificationPreference.set({
        userId: 'user-1',
        category: MUTABLE,
        muted: true,
      });

      expect(Object.isFrozen(preference)).toBe(true);
    });
  });

  describe('an account-critical category (BR-61 / VR-38)', () => {
    it('refuses to be muted', () => {
      expect(() =>
        NotificationPreference.set({
          userId: 'user-1',
          category: CRITICAL,
          muted: true,
        }),
      ).toThrow(AccountCriticalCategoryError);
    });

    // APIS §10.12 conditions the 422 on the CATEGORY, not on the requested
    // value: an immutable category is not writable at all, and `muted=false`
    // is already what R-15's "absent = unmuted" gives it.
    it('refuses an unmute too — the category is not writable', () => {
      expect(() =>
        NotificationPreference.set({
          userId: 'user-1',
          category: CRITICAL,
          muted: false,
        }),
      ).toThrow(AccountCriticalCategoryError);
    });

    it('names the refused category on the error', () => {
      try {
        NotificationPreference.set({
          userId: 'user-1',
          category: CRITICAL,
          muted: true,
        });
        fail('expected AccountCriticalCategoryError');
      } catch (error) {
        expect(error).toBeInstanceOf(AccountCriticalCategoryError);
        expect((error as AccountCriticalCategoryError).category).toBe('N-03');
        expect((error as AccountCriticalCategoryError).message).toBe(
          'هذه الفئة حساسة للحساب ولا يمكن كتمها',
        );
      }
    });

    it.each(['N-03', 'N-04', 'N-08'])(
      'covers %s — the three DEC-D03 account-critical events',
      (code) => {
        expect(() =>
          NotificationPreference.set({
            userId: 'user-1',
            category: { code, description: 'x', isMutable: false },
            muted: true,
          }),
        ).toThrow(AccountCriticalCategoryError);
      },
    );
  });

  it('decides on the catalogue row, never on a client-supplied flag', () => {
    // The DTO cannot carry `is_mutable`; even if a caller smuggled one in,
    // the factory only ever sees the row the repository resolved.
    expect(() =>
      NotificationPreference.set({
        userId: 'user-1',
        category: { ...CRITICAL },
        muted: true,
      }),
    ).toThrow(AccountCriticalCategoryError);
  });
});
