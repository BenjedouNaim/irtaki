import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  @IsNotEmpty({ message: 'رمز إعادة التعيين مطلوب' })
  @IsString({ message: 'رمز إعادة التعيين غير صالح' })
  token!: string;

  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة' })
  @IsString({ message: 'كلمة المرور غير صالحة' })
  @MinLength(8, { message: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل' })
  new_password!: string;
}
