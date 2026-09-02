import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitDailyReportDto } from './submit-daily-report.dto';

/** Mirrors app.module's ValidationPipe options (whitelist + forbidNonWhitelisted). */
async function fields(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(SubmitDailyReportDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property);
}

const memoRange = { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } };
const revRange = { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } };

describe('SubmitDailyReportDto (transport layer, APIS §10.7)', () => {
  it('accepts the APIS §12 example body', async () => {
    expect(
      await fields({
        type: 'Normal',
        memo_range: memoRange,
        memo_time: { from: '18:00', to: '18:45' },
        completed_50_repetitions: true,
        repetitions_in_single_session: true,
        rev_range: revRange,
        rev_time: { from: '19:00', to: '19:10' },
        read_tafsir: false,
      }),
    ).toEqual([]);
  });

  it('accepts a Normal report with neither range (BR-48)', async () => {
    expect(await fields({ type: 'Normal' })).toEqual([]);
  });

  it('accepts an Absent report with a reason and a Revision report with range + time', async () => {
    expect(await fields({ type: 'Absent', absence_reason: 'Sick' })).toEqual(
      [],
    );
    expect(
      await fields({
        type: 'Revision',
        rev_range: revRange,
        rev_time: { from: '19:00', to: '19:10' },
      }),
    ).toEqual([]);
  });

  it('accepts an optional report_date in YYYY-MM-DD', async () => {
    expect(
      await fields({
        type: 'Absent',
        absence_reason: 'Other',
        report_date: '2026-09-02',
      }),
    ).toEqual([]);
    expect(
      await fields({
        type: 'Absent',
        absence_reason: 'Other',
        report_date: '02/09/2026',
      }),
    ).toEqual(['report_date']);
  });

  it('rejects an unknown type', async () => {
    expect(await fields({ type: 'Weekly' })).toEqual(['type']);
  });

  it('requires absence_reason iff type=Absent (VR-19) and validates its enum', async () => {
    expect(await fields({ type: 'Absent' })).toEqual(['absence_reason']);
    expect(await fields({ type: 'Absent', absence_reason: 'Holiday' })).toEqual(
      ['absence_reason'],
    );
  });

  it('requires memo_time when memo_range is present (VR-16)', async () => {
    expect(
      await fields({
        type: 'Normal',
        memo_range: memoRange,
        completed_50_repetitions: false,
      }),
    ).toEqual(['memo_time']);
  });

  it('requires completed_50_repetitions when memo_range is present', async () => {
    expect(
      await fields({
        type: 'Normal',
        memo_range: memoRange,
        memo_time: { from: '18:00', to: '18:45' },
      }),
    ).toEqual(['completed_50_repetitions']);
  });

  it('requires rev_range for a Revision report (VR-20) and rev_time with any rev_range (VR-17)', async () => {
    expect(await fields({ type: 'Revision' })).toEqual(['rev_range']);
    expect(await fields({ type: 'Normal', rev_range: revRange })).toEqual([
      'rev_time',
    ]);
  });

  it('validates nested ayah positions and HH:MM times', async () => {
    expect(
      await fields({
        type: 'Normal',
        memo_range: { from: { surah: 0, ayah: 1 }, to: { surah: 2, ayah: 20 } },
        memo_time: { from: '18:00', to: '18:45' },
        completed_50_repetitions: false,
      }),
    ).toEqual(['memo_range']);
    expect(
      await fields({
        type: 'Normal',
        memo_range: memoRange,
        memo_time: { from: '6pm', to: '18:45' },
        completed_50_repetitions: false,
      }),
    ).toEqual(['memo_time']);
  });

  it('rejects unknown and server-derived properties (whitelist, mass assignment)', async () => {
    expect(
      await fields({
        type: 'Absent',
        absence_reason: 'Sick',
        no_memorization_today: true,
      }),
    ).toEqual(['no_memorization_today']);
    expect(
      await fields({
        type: 'Absent',
        absence_reason: 'Sick',
        membership_id: 'x',
      }),
    ).toEqual(['membership_id']);
  });
});
