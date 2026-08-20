import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  email!: string;

  @IsString({ message: 'كلمة المرور مطلوبة' })
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  password!: string;

  @IsString()
  @IsOptional()
  device_token?: string;
}
