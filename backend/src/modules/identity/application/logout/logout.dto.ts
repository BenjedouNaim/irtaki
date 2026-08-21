import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @IsNotEmpty({ message: 'رمز التحديث مطلوب' })
  @IsString({ message: 'رمز التحديث يجب أن يكون نصاً' })
  refresh_token!: string;
}
