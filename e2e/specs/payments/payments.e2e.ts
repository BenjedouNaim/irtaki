import * as api from '../../src/fixtures/api.js';
import { group, student } from '../../src/fixtures/builders.js';
import { query } from '../../src/fixtures/db.js';
import { confirmDialog, launchLoggedOut, loginAs, scrollAndTap, tap, waitVisible } from '../../src/support/app.js';
import { byId } from '../../src/support/locators.js';
import { addDays, addMonths, localDate } from '../../src/support/time.js';

const today = localDate();
/** Membership start dates that put the current 3-month cycle in a known state. */
const START = {
  /** Cycle 0 began today: current cycle Unpaid, not yet due soon. */
  fresh: today,
  /** Cycle 0 ends in 5 days: inside the 10-day Due Soon window (BR-33). */
  dueSoon: addDays(addMonths(today, -3), 5),
  /** Cycles 0 and 1 are over and unpaid: 2 cycles in arrears, cycle 2 current. */
  twoInArrears: addDays(addMonths(today, -6), -20),
};

async function paidCycles(membershipId: string): Promise<number[]> {
  const rows = await query<{ cycle_index: number }>(
    'SELECT cycle_index FROM payment_records WHERE membership_id = $1 ORDER BY cycle_index',
    [membershipId],
  );
  return rows.map((r) => r.cycle_index);
}

/** SCR-16 (Student) · SCR-20/21 (Assistant) · UC-09 · J5 · docs/UF.md §18 */
describe('Payments', () => {
  beforeEach(async () => {
    await launchLoggedOut();
  });

  it('@P0 PAY-01 a student sees their current cycle and arrears in dinars', async () => {
    const s = await student(await group(), { startedAt: START.twoInArrears });
    const ledger = await api.ownLedger(s.session.token);
    expect(ledger.arrears_count).toBe(2);

    await loginAs(s.session.email, s.session.password, 'Student');
    await tap('student-tab-bar-payment');

    await expect(byId('current-cycle-card')).toBeDisplayed({ wait: 15_000 });
    await expect(byId('payment-arrears-banner-message')).toHaveText(expect.stringContaining('الإجمالي 60 دينارًا'));
    await expect(byId('payment-cycle-row-0')).toBeExisting();
    await expect(byId('payment-cycle-row-2')).toBeExisting();
  });

  it('@P0 PAY-02 the ledger filters students by the status of their current cycle', async () => {
    const g = await group();
    const paid = await student(g, { startedAt: START.fresh });
    const dueSoon = await student(g, { startedAt: START.dueSoon });
    const unpaid = await student(g, { startedAt: START.fresh });
    await api.recordPayment(g.assistant.token, paid.membershipId, 0);

    await loginAs(g.assistant.email, g.assistant.password, 'Assistant');
    await tap('assistant-tab-bar-payments');
    const row = (s: { membershipId: string }) => byId(`payment-ledger-row-${s.membershipId}`);
    await row(unpaid).waitForExist({ timeout: 15_000 });

    const cases = [
      ['paid', paid],
      ['due-soon', dueSoon],
      ['unpaid', unpaid],
    ] as const;
    for (const [filter, expected] of cases) {
      await tap(`payments-ledger-filter-${filter}`);
      await expect(row(expected)).toBeExisting({ wait: 10_000 });
      for (const other of [paid, dueSoon, unpaid].filter((x) => x !== expected)) {
        await expect(row(other)).not.toBeExisting();
      }
    }

    await tap('payments-ledger-filter-all');
    for (const s of [paid, dueSoon, unpaid]) {
      await expect(row(s)).toBeExisting({ wait: 10_000 });
    }
  });

  it('@P0 PAY-03 the Assistant records a paid cycle after a strong confirmation', async () => {
    const g = await group();
    const s = await student(g);

    await loginAs(g.assistant.email, g.assistant.password, 'Assistant');
    await tap('assistant-tab-bar-payments');
    await tap(`payment-ledger-row-${s.membershipId}`);
    await tap('payment-detail-cycle-row-0-mark-paid');

    await expect(byId('payment-detail-confirm-message')).toHaveText(expect.stringContaining('لا يمكن التراجع'));
    await confirmDialog('payment-detail-confirm');
    await waitVisible('payment-detail-cycle-row-0-badge', 15_000);
    await expect(byId('payment-detail-cycle-row-0-badge')).toHaveText(expect.stringContaining('مدفوع'));
    await expect(byId('payment-detail-cycle-row-0-mark-paid')).not.toBeExisting();

    expect(await paidCycles(s.membershipId)).toEqual([0]);
    expect((await api.ownLedger(s.session.token)).cycles[0].status).toBe('Paid');
  });

  it('@P1 PAY-04 overdue cycles can be paid in any order; future cycles cannot be paid', async () => {
    const g = await group();
    const s = await student(g, { startedAt: START.twoInArrears });

    await loginAs(g.assistant.email, g.assistant.password, 'Assistant');
    await tap('assistant-tab-bar-payments');
    await tap(`payment-ledger-row-${s.membershipId}`);
    // Arabic dual form for two (utils/paymentCopy.ts).
    await expect(byId('payment-detail-arrears-count')).toHaveText('دورتان متأخرتان');

    await scrollAndTap('payment-detail-cycle-row-1-mark-paid');
    await confirmDialog('payment-detail-confirm');
    await expect(byId('payment-detail-cycle-row-1-mark-paid')).not.toBeExisting({ wait: 15_000 });
    expect(await paidCycles(s.membershipId)).toEqual([1]);

    await expect(byId('payment-detail-cycle-row-0-mark-paid')).toBeExisting();
    await expect(byId('payment-detail-cycle-row-3')).not.toBeExisting();
  });

  it('@P1 PAY-05 a cycle paid meanwhile is refreshed instead of recorded twice', async () => {
    const g = await group();
    const s = await student(g);

    await loginAs(g.assistant.email, g.assistant.password, 'Assistant');
    await tap('assistant-tab-bar-payments');
    await tap(`payment-ledger-row-${s.membershipId}`);
    await tap('payment-detail-cycle-row-0-mark-paid');

    await api.recordPayment(g.assistant.token, s.membershipId, 0);
    await confirmDialog('payment-detail-confirm');
    await waitVisible('payment-detail-cycle-row-0-badge', 15_000);
    await expect(byId('payment-detail-cycle-row-0-badge')).toHaveText(expect.stringContaining('مدفوع'));
    expect(await paidCycles(s.membershipId)).toEqual([0]);
  });
});
