import { IsIn } from 'class-validator';

export class SetLifecycleDto {
  @IsIn(['Active', 'Archived'], {
    message: 'حالة دورة الحياة يجب أن تكون إما Active أو Archived',
  })
  lifecycle_state!: 'Active' | 'Archived';
}
