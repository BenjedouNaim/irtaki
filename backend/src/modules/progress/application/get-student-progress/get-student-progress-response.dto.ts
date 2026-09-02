import { ProgressDto } from '../get-own-progress/get-own-progress-response.dto';

/** API-042 — same payload shape as API-041 (APIS §10.10). */
export interface GetStudentProgressResponseDto {
  data: ProgressDto;
}
