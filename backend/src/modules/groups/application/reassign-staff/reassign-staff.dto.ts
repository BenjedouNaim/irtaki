import { IsOptional, IsUUID } from 'class-validator';

export class ReassignStaffDto {
  @IsOptional()
  @IsUUID('all', { message: 'معرف المعلم غير صالح' })
  teacher_id?: string;

  @IsOptional()
  @IsUUID('all', { message: 'معرف المساعد الإداري غير صالح' })
  assistant_id?: string;
}
