import { IsIn, IsInt, IsNotEmpty, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateGroupDto {
  @IsString({ message: 'اسم الحلقة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الحلقة مطلوب' })
  name!: string;

  @IsIn(['Male', 'Female'], {
    message: 'الجنس المحدد غير صالح (يجب أن يكون ذكور أو إناث)',
  })
  gender!: 'Male' | 'Female';

  @IsInt({ message: 'يوم التسميع يجب أن يكون رقماً صحيحاً' })
  @Min(1, { message: 'يوم التسميع يجب أن يكون بين 1 و 7' })
  @Max(7, { message: 'يوم التسميع يجب أن يكون بين 1 و 7' })
  recitation_day!: number;

  @IsUUID('all', { message: 'معرف المعلم غير صالح' })
  teacher_id!: string;

  @IsUUID('all', { message: 'معرف المساعد غير صالح' })
  assistant_id!: string;
}
