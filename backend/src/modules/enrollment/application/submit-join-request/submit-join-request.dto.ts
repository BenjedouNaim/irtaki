import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TajweedLevel } from '../../domain/applicant-score';

export class SubmitJoinRequestDto {
  @IsUUID('all', { message: 'معرف الحلقة غير صالح' })
  group_id!: string;

  @IsString({ message: 'الاسم الكامل يجب أن يكون نصاً' })
  @Length(3, 80, { message: 'الاسم الكامل يجب أن يكون بين 3 و 80 حرفاً' })
  full_name!: string;

  @IsIn(['Male', 'Female'], { message: 'الجنس يجب أن يكون Male أو Female' })
  gender!: 'Male' | 'Female';

  @IsInt({ message: 'العمر يجب أن يكون رقماً صحيحاً' })
  @Min(1, { message: 'العمر يجب أن يكون أكبر من 0' })
  age!: number;

  @IsString({ message: 'رقم الهاتف مطلوب' })
  @Matches(/^(\+216)?[2-9]\d{7}$/, {
    message: 'رقم الهاتف يجب أن يكون بتنسيق تونسي صالح',
  })
  phone_number!: string;

  @IsString({ message: 'المهنة مطلوبة' })
  @IsNotEmpty({ message: 'المهنة لا يمكن أن تكون فارغة' })
  occupation!: string;

  @IsString({ message: 'المدينة مطلوبة' })
  @IsNotEmpty({ message: 'المدينة لا يمكن أن تكون فارغة' })
  city!: string;

  @IsArray({ message: 'قائمة الأحزاب يجب أن تكون مصفوفة' })
  @ArrayNotEmpty({ message: 'قائمة الأحزاب لا يمكن أن تكون فارغة' })
  @IsInt({ each: true, message: 'كل حزب يجب أن يكون رقماً صحيحاً' })
  @Min(1, { each: true, message: 'رقم الحزب يجب أن يكون بين 1 و 60' })
  @Max(60, { each: true, message: 'رقم الحزب يجب أن يكون بين 1 و 60' })
  memorized_ahzab!: number[];

  @IsIn(['Beginner', 'Intermediate', 'Advanced'], {
    message: 'مستوى التجويد يجب أن يكون Beginner أو Intermediate أو Advanced',
  })
  tajweed_level!: TajweedLevel;

  @IsBoolean({
    message: 'دراسة أحكام التجويد يجب أن تكون قيمة منطقية (نعم/لا)',
  })
  studied_tajweed_theory!: boolean;

  @IsBoolean({
    message: 'دراسة رواية قالون يجب أن تكون قيمة منطقية (نعم/لا)',
  })
  studied_qalun!: boolean;

  @IsBoolean({ message: 'الموافقة على الرسوم يجب أن تكون قيمة منطقية' })
  fee_agreement!: boolean;

  @IsIn(['Memorization', 'Revision'], {
    message: 'هدف البرنامج يجب أن يكون Memorization أو Revision',
  })
  program_goal!: string;
}
