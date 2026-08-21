import { IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'المنطقة الزمنية غير صالحة' })
  timezone?: string;
}
