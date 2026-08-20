import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  email!: string;

  @IsString({ message: 'كلمة المرور مطلوبة' })
  @MinLength(8, { message: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل' })
  password!: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  device_token?: string;
}
