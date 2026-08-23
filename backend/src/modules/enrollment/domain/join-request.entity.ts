import { uuidv7 } from 'uuidv7';
import {
  calculateApplicantScore,
  TajweedLevel,
} from './applicant-score';
import {
  DomainValidationErrorDetail,
  JoinRequestValidationError,
} from './join-request.errors';

export interface SubmitJoinRequestProps {
  id?: string;
  userId: string;
  groupId: string;
  groupGender: 'Male' | 'Female';
  fullName: string;
  gender: 'Male' | 'Female';
  age: number;
  phoneNumber: string;
  occupation: string;
  city: string;
  memorizedAhzab: number[];
  tajweedLevel: TajweedLevel;
  studiedTajweedTheory: boolean;
  studiedQalun: boolean;
  feeAgreement: boolean;
  programGoal: 'Memorization' | 'Revision' | string;
  createdAt?: Date;
}

export class JoinRequest {
  private readonly _id: string;
  private readonly _userId: string;
  private readonly _groupId: string;
  private readonly _fullName: string;
  private readonly _gender: 'Male' | 'Female';
  private readonly _age: number;
  private readonly _phoneNumber: string;
  private readonly _occupation: string;
  private readonly _city: string;
  private readonly _memorizedAhzab: number[];
  private readonly _memorizedHizbCount: number;
  private readonly _tajweedLevel: TajweedLevel;
  private readonly _studiedTajweedTheory: boolean;
  private readonly _studiedQalun: boolean;
  private readonly _feeAgreement: boolean;
  private readonly _programGoal: string;
  private readonly _score: number;
  private _status: 'Pending' | 'Accepted' | 'Rejected';
  private _resolutionSource: string | null;
  private _reviewedAt: Date | null;
  private _reviewedBy: string | null;
  private readonly _createdAt: Date;
  private _deletedAt: Date | null;

  private constructor(
    id: string,
    userId: string,
    groupId: string,
    fullName: string,
    gender: 'Male' | 'Female',
    age: number,
    phoneNumber: string,
    occupation: string,
    city: string,
    memorizedAhzab: number[],
    memorizedHizbCount: number,
    tajweedLevel: TajweedLevel,
    studiedTajweedTheory: boolean,
    studiedQalun: boolean,
    feeAgreement: boolean,
    programGoal: string,
    score: number,
    status: 'Pending' | 'Accepted' | 'Rejected',
    resolutionSource: string | null,
    reviewedAt: Date | null,
    reviewedBy: string | null,
    createdAt: Date,
    deletedAt: Date | null,
  ) {
    this._id = id;
    this._userId = userId;
    this._groupId = groupId;
    this._fullName = fullName;
    this._gender = gender;
    this._age = age;
    this._phoneNumber = phoneNumber;
    this._occupation = occupation;
    this._city = city;
    this._memorizedAhzab = memorizedAhzab;
    this._memorizedHizbCount = memorizedHizbCount;
    this._tajweedLevel = tajweedLevel;
    this._studiedTajweedTheory = studiedTajweedTheory;
    this._studiedQalun = studiedQalun;
    this._feeAgreement = feeAgreement;
    this._programGoal = programGoal;
    this._score = score;
    this._status = status;
    this._resolutionSource = resolutionSource;
    this._reviewedAt = reviewedAt;
    this._reviewedBy = reviewedBy;
    this._createdAt = createdAt;
    this._deletedAt = deletedAt;
  }

  public static submit(props: SubmitJoinRequestProps): JoinRequest {
    const details: DomainValidationErrorDetail[] = [];

    // Distinct ahzab validation (VR-04a)
    const uniqueAhzab = Array.from(new Set(props.memorizedAhzab));
    const validRange = uniqueAhzab.every(
      (hizb) => Number.isInteger(hizb) && hizb >= 1 && hizb <= 60,
    );

    if (!validRange) {
      details.push({
        field: 'memorized_ahzab',
        rule: 'VR-04a',
        message: 'أرقام الأحزاب يجب أن تكون صحيحة بين 1 و 60',
      });
    }

    if (uniqueAhzab.length < 5) {
      details.push({
        field: 'memorized_ahzab',
        rule: 'VR-04a',
        message: 'يجب حفظ 5 أحزاب على الأقل للتقديم',
      });
    } else if (uniqueAhzab.length > 60) {
      details.push({
        field: 'memorized_ahzab',
        rule: 'VR-04a',
        message: 'عدد الأحزاب المحفوظة لا يمكن أن يتجاوز 60 حزباً',
      });
    }

    // Fee agreement validation (VR-06)
    if (props.feeAgreement !== true) {
      details.push({
        field: 'fee_agreement',
        rule: 'VR-06',
        message: 'الموافقة على الرسوم الفصلية إلزامية لتقديم الطلب',
      });
    }

    // Program goal validation (VR-07)
    if (props.programGoal !== 'Memorization') {
      details.push({
        field: 'program_goal',
        rule: 'VR-07',
        message: 'التسجيل متاح فقط لبرنامج الحفظ حالياً',
      });
    }

    // Gender alignment validation (VR-08)
    if (props.gender !== props.groupGender) {
      details.push({
        field: 'gender',
        rule: 'VR-08',
        message: 'جنس المتقدم يجب أن يتطابق مع الفئة المستهدفة للحلقة',
      });
    }

    if (details.length > 0) {
      throw new JoinRequestValidationError(details);
    }

    // Score calculation (immutable snapshot BR-38)
    const score = calculateApplicantScore({
      memorizedAhzabCount: uniqueAhzab.length,
      tajweedLevel: props.tajweedLevel,
      studiedTajweedTheory: props.studiedTajweedTheory,
      studiedQalun: props.studiedQalun,
    });

    return new JoinRequest(
      props.id ?? uuidv7(),
      props.userId,
      props.groupId,
      props.fullName.trim(),
      props.gender,
      props.age,
      props.phoneNumber.trim(),
      props.occupation.trim(),
      props.city.trim(),
      uniqueAhzab.sort((a, b) => a - b),
      uniqueAhzab.length,
      props.tajweedLevel,
      props.studiedTajweedTheory,
      props.studiedQalun,
      props.feeAgreement,
      props.programGoal,
      score,
      'Pending',
      null,
      null,
      null,
      props.createdAt ?? new Date(),
      null,
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

  get fullName(): string {
    return this._fullName;
  }

  get gender(): 'Male' | 'Female' {
    return this._gender;
  }

  get age(): number {
    return this._age;
  }

  get phoneNumber(): string {
    return this._phoneNumber;
  }

  get occupation(): string {
    return this._occupation;
  }

  get city(): string {
    return this._city;
  }

  get memorizedAhzab(): number[] {
    return [...this._memorizedAhzab];
  }

  get memorizedHizbCount(): number {
    return this._memorizedHizbCount;
  }

  get tajweedLevel(): TajweedLevel {
    return this._tajweedLevel;
  }

  get studiedTajweedTheory(): boolean {
    return this._studiedTajweedTheory;
  }

  get studiedQalun(): boolean {
    return this._studiedQalun;
  }

  get feeAgreement(): boolean {
    return this._feeAgreement;
  }

  get programGoal(): string {
    return this._programGoal;
  }

  get score(): number {
    return this._score;
  }

  get status(): 'Pending' | 'Accepted' | 'Rejected' {
    return this._status;
  }

  get resolutionSource(): string | null {
    return this._resolutionSource;
  }

  get reviewedAt(): Date | null {
    return this._reviewedAt;
  }

  get reviewedBy(): string | null {
    return this._reviewedBy;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get deletedAt(): Date | null {
    return this._deletedAt;
  }
}
