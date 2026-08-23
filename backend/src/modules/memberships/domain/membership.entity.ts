import { uuidv7 } from 'uuidv7';

export interface CreateMembershipFromAcceptanceProps {
  id?: string;
  userId: string;
  groupId: string;
  joinRequestId: string;
  startedAt?: string;
  createdAt?: Date;
}

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
    const startedAt = props.startedAt ?? now.toISOString().split('T')[0];

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
