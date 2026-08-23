import { encodeCursor, decodeCursor, clampLimit } from './cursor.util';

describe('Cursor Utility (cursor.util)', () => {
  describe('encodeCursor and decodeCursor', () => {
    it('encodes and decodes a valid cursor payload round-trip', () => {
      const payload = {
        id: '01916362-e61e-7f61-8270-b74e892c90c7',
        sortKey: {
          score: 85.5,
          createdAt: '2026-08-23T10:00:00.000Z',
        },
      };

      const encoded = encodeCursor(payload);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = decodeCursor<typeof payload.sortKey>(encoded);
      expect(decoded).toEqual(payload);
    });

    it('returns null when decoding an undefined, null, or empty string', () => {
      expect(decodeCursor(undefined)).toBeNull();
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor('')).toBeNull();
    });

    it('returns null on invalid base64 or non-JSON string', () => {
      expect(decodeCursor('not-a-valid-base64-json!')).toBeNull();
      expect(decodeCursor('!!!')).toBeNull();
    });

    it('returns null when payload is missing id or sortKey', () => {
      const missingId = Buffer.from(JSON.stringify({ sortKey: 123 })).toString(
        'base64',
      );
      expect(decodeCursor(missingId)).toBeNull();

      const missingSortKey = Buffer.from(
        JSON.stringify({ id: 'some-id' }),
      ).toString('base64');
      expect(decodeCursor(missingSortKey)).toBeNull();

      const nonObject = Buffer.from(JSON.stringify('just-a-string')).toString(
        'base64',
      );
      expect(decodeCursor(nonObject)).toBeNull();
    });
  });

  describe('clampLimit', () => {
    it('returns default limit (20) when input is undefined, null, empty string, or NaN', () => {
      expect(clampLimit(undefined)).toBe(20);
      expect(clampLimit(null)).toBe(20);
      expect(clampLimit('')).toBe(20);
      expect(clampLimit('abc')).toBe(20);
      expect(clampLimit(NaN)).toBe(20);
      expect(clampLimit(Infinity)).toBe(20);
    });

    it('clamps values below min (default 1) to 1', () => {
      expect(clampLimit(0)).toBe(1);
      expect(clampLimit(-10)).toBe(1);
      expect(clampLimit('-5')).toBe(1);
    });

    it('clamps values above max (default 100) to 100', () => {
      expect(clampLimit(101)).toBe(100);
      expect(clampLimit(500)).toBe(100);
      expect(clampLimit('250')).toBe(100);
    });

    it('floors float numbers within range', () => {
      expect(clampLimit(25.7)).toBe(25);
      expect(clampLimit('15.2')).toBe(15);
    });

    it('respects custom options', () => {
      expect(clampLimit(undefined, { default: 50 })).toBe(50);
      expect(clampLimit(2, { min: 5 })).toBe(5);
      expect(clampLimit(50, { max: 30 })).toBe(30);
    });
  });
});
