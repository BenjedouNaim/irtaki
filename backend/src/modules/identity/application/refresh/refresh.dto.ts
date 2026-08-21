import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @IsNotEmpty({ message: 'رمز التحديث مطلوب' })
  @IsString({ message: 'رمز التحديث يجب أن يكون نصاً' })
  refresh_token!: string;
}
