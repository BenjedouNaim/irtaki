import { uuidv7 } from 'uuidv7';
import { localDateInTimezone } from '../../reports/domain/local-date';

export interface CreateMembershipFromAcceptanceProps {
  id?: string;
  userId: string;
  groupId: string;
  joinRequestId: string;
  /**
   * The accepted applicant's `users.timezone`. `started_at` is a calendar
   * date (DBD: `DATE`, not `TIMESTAMPTZ`), so INV-27 / T-01 make this the
   * only authority for which date "now" falls on — never UTC, never
   * `CENTER_TIMEZONE`.
   */
  timezone: string;
  /** An explicit date wins; supplied by tests and by any backfill path. */
  startedAt?: string;
  createdAt?: Date;
}

/**
 * E-03 Membership (DMS §7.1). Framework-free (TS §9).
 *
 * One enrollment episode, and the aggregate root (AGG-03) of everything
 * reported, paid and memorised inside it. The shape enforces three
 * invariants structurally rather than by convention:
 *
 * - **INV-19** — `createFromAcceptance` is the only construction path and
 *   it always starts `Active` with no history: no coverage, no reports and
 *   no payment cycles carry forward from a prior Membership of the same
 *   User (DEC-C02, BR-40). A rejoining User simply gets a new row.
 * - **INV-20** — every field is `readonly` and there is no revive method,
 *   so `Terminated` is terminal (ST-03). Termination is a guarded UPDATE in
 *   the repository, never a state change on a loaded instance.
 * - **INV-27** — `started_at` is derived in the member's own timezone.
 *
 * **INV-03** ("at most one Active Membership per User") spans the User and
 * Membership roots and so cannot live here: DMS §15 assigns it to DS-01 at
 * the acceptance moment, backed by the DB-UQ-02 partial unique index.
 */
export class Membership {
  private readonly _id: string;
  private readonly _userId: string;
  private readonly _groupId: string;
  private readonly _joinRequestId: string | null;
  private readonly _state: 'Active' | 'Terminated';
  private readonly _startedAt: string;
  private readonly _endedAt: string | null;
  private readonly _endedBy: string | null;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  private constructor(
    id: string,
    userId: string,
    groupId: string,
    joinRequestId: string | null,
    state: 'Active' | 'Terminated',
    startedAt: string,
    endedAt: string | null,
    endedBy: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this._id = id;
    this._userId = userId;
    this._groupId = groupId;
    this._joinRequestId = joinRequestId;
    this._state = state;
    this._startedAt = startedAt;
    this._endedAt = endedAt;
    this._endedBy = endedBy;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  public static createFromAcceptance(
    props: CreateMembershipFromAcceptanceProps,
  ): Membership {
    const now = props.createdAt ?? new Date();
    const startedAt =
      props.startedAt ?? localDateInTimezone(now, props.timezone);

    return new Membership(
      props.id ?? uuidv7(),
      props.userId,
      props.groupId,
      props.joinRequestId,
      'Active',
      startedAt,
      null,
      null,
      now,
      now,
    );
  }

  get id(): string {
    return this._id;
  }

  get userId(): string {
    return this._userId;
  }

  get groupId(): string {
    return this._groupId;
  }

  get joinRequestId(): string | null {
    return this._joinRequestId;
  }

  get state(): 'Active' | 'Terminated' {
    return this._state;
  }

  get startedAt(): string {
    return this._startedAt;
  }

  get endedAt(): string | null {
    return this._endedAt;
  }

  get endedBy(): string | null {
    return this._endedBy;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }
}
