import { IsIn } from 'class-validator';

export class ToggleEnrollmentDto {
  @IsIn(['Open', 'Closed'], {
    message: 'حالة التسجيل يجب أن تكون إما Open أو Closed',
  })
  enrollment_status!: 'Open' | 'Closed';
}
