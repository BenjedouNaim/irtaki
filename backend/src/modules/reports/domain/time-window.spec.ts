import { DailyReportValidationError } from './daily-report.errors';
import { TimeWindow } from './time-window';

describe('TimeWindow (VO-03)', () => {
  it('builds a window when to > from (VR-15)', () => {
    const window = TimeWindow.of('18:00', '18:45', 'memo_time');
    expect(window.from).toBe('18:00');
    expect(window.to).toBe('18:45');
  });

  it.each([
    ['18:45', '18:00'],
    ['18:00', '18:00'],
  ])(
    'rejects to <= from (%s → %s) with a VR-15 detail on the named field',
    (from, to) => {
      expect.assertions(2);
      try {
        TimeWindow.of(from, to, 'rev_time');
      } catch (err) {
        expect(err).toBeInstanceOf(DailyReportValidationError);
        expect((err as DailyReportValidationError).details).toEqual([
          {
            field: 'rev_time',
            rule: 'VR-15',
            message: 'يجب أن يكون وقت الانتهاء بعد وقت البداية',
          },
        ]);
      }
    },
  );

  it.each(['6:00', '24:00', '18:60', '1800', '18:00:00', ''])(
    'rejects a value that is not HH:MM (%s)',
    (bad) => {
      expect(() => TimeWindow.of(bad, '23:59', 'memo_time')).toThrow(
        DailyReportValidationError,
      );
      expect(TimeWindow.isHourMinute(bad)).toBe(false);
    },
  );

  it('compares structurally', () => {
    expect(
      TimeWindow.of('08:00', '09:00', 'memo_time').equals(
        TimeWindow.of('08:00', '09:00', 'rev_time'),
      ),
    ).toBe(true);
    expect(
      TimeWindow.of('08:00', '09:00', 'memo_time').equals(
        TimeWindow.of('08:00', '09:30', 'memo_time'),
      ),
    ).toBe(false);
  });
});
