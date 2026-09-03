import { uuidv7 } from 'uuidv7';

export interface CreateGroupProps {
  id?: string;
  name: string;
  gender: 'Male' | 'Female';
  recitationDay: number;
  enrollmentStatus?: 'Open' | 'Closed';
  lifecycleState?: 'Active' | 'Archived';
  archivedAt?: Date | null;
  teacherId: string;
  assistantId: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * E-02 Group (DMS §7.1). Framework-free (TS §9).
 *
 * `recitationDay` and `gender` are `readonly` with no setter, so INV-05
 * ("a Group's `recitation_day` is immutable after creation", BR-12 / VR-25)
 * holds structurally in the domain, mirroring the DB-CHK-06 trigger that
 * enforces the same rule in the database.
 *
 * INV-04's two halves are split by where the facts live: "exactly one
 * Teacher and exactly one Assistant" is structural here — both ids are
 * non-optional on `CreateGroupProps` (VR-23, "assigned at creation and
 * cannot be null") — while "each correctly-roled" (VR-24) needs the two
 * `users` rows and is therefore checked by `CreateGroupUseCase` /
 * `ReassignStaffUseCase` (DS-08), not by this entity.
 *
 * `enrollmentStatus` defaults to `Closed`, never `Open`: FR-GRP-01 / UC-10
 * step 3 (SRS §384, SAS §1691, APIS §369) create a group closed so the
 * Admin can staff it before applications arrive. `lifecycleState` defaults
 * to `Active`. The two are independent axes (ST-02, DBD §123).
 */
export class Group {
  private readonly _id: string;
  private _name: string;
  private readonly _gender: 'Male' | 'Female';
  private readonly _recitationDay: number;
  private _enrollmentStatus: 'Open' | 'Closed';
  private _lifecycleState: 'Active' | 'Archived';
  private _archivedAt: Date | null;
  private _teacherId: string;
  private _assistantId: string;
  private readonly _createdBy: string;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  constructor(props: CreateGroupProps) {
    this._id = props.id ?? uuidv7();
    this._name = props.name.trim();
    this._gender = props.gender;
    this._recitationDay = props.recitationDay;
    this._enrollmentStatus = props.enrollmentStatus ?? 'Closed';
    this._lifecycleState = props.lifecycleState ?? 'Active';
    this._archivedAt = props.archivedAt ?? null;
    this._teacherId = props.teacherId;
    this._assistantId = props.assistantId;
    this._createdBy = props.createdBy;
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
  }

  get id(): string {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get gender(): 'Male' | 'Female' {
    return this._gender;
  }

  get recitationDay(): number {
    return this._recitationDay;
  }

  get enrollmentStatus(): 'Open' | 'Closed' {
    return this._enrollmentStatus;
  }

  get lifecycleState(): 'Active' | 'Archived' {
    return this._lifecycleState;
  }

  get archivedAt(): Date | null {
    return this._archivedAt;
  }

  get teacherId(): string {
    return this._teacherId;
  }

  get assistantId(): string {
    return this._assistantId;
  }

  get createdBy(): string {
    return this._createdBy;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }
}
