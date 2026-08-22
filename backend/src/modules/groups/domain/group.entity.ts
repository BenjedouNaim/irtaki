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
    this._enrollmentStatus = props.enrollmentStatus ?? 'Open';
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
