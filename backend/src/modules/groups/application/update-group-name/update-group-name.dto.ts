import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateGroupNameDto {
  @IsString({ message: 'اسم الحلقة يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم الحلقة مطلوب' })
  name!: string;
}
