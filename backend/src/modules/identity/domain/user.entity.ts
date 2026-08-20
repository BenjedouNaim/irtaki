import { uuidv7 } from 'uuidv7';
import { UserRole } from './user-role.enum';

export interface CreateUserProps {
  id?: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
  fullName?: string | null;
  gender?: 'Male' | 'Female' | null;
  timezone: string;
  mustChangePassword?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class User {
  private readonly _id: string;
  private _email: string;
  private _passwordHash: string;
  private _role: UserRole;
  private _fullName: string | null;
  private _gender: 'Male' | 'Female' | null;
  private _timezone: string;
  private _mustChangePassword: boolean;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  constructor(props: CreateUserProps) {
    this._id = props.id ?? uuidv7();
    this._email = props.email.toLowerCase().trim();
    this._passwordHash = props.passwordHash;
    this._role = props.role ?? UserRole.User;
    this._fullName = props.fullName ?? null;
    this._gender = props.gender ?? null;
    this._timezone = props.timezone;
    this._mustChangePassword = props.mustChangePassword ?? false;
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
  }

  get id(): string {
    return this._id;
  }

  get email(): string {
    return this._email;
  }

  get passwordHash(): string {
    return this._passwordHash;
  }

  get role(): UserRole {
    return this._role;
  }

  get fullName(): string | null {
    return this._fullName;
  }

  get gender(): 'Male' | 'Female' | null {
    return this._gender;
  }

  get timezone(): string {
    return this._timezone;
  }

  get mustChangePassword(): boolean {
    return this._mustChangePassword;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  updateTimezone(timezone: string): void {
    this._timezone = timezone;
    this._updatedAt = new Date();
  }
}
