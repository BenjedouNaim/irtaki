import { IsBoolean } from 'class-validator';

/**
 * `ConfirmWeeklyReportDto` — API-034 request body (APIS §10.8):
 * `{ attended_recitation_call: boolean }`. The Student's one write on E-06
 * (DMS E-06 "Modification conditions"). Allow-list DTO: the global
 * `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`) strips and rejects
 * anything else (TS §21 transport layer, AGENTS §11 mass assignment).
 */
export class ConfirmWeeklyReportDto {
  @IsBoolean({ message: 'يجب تحديد ما إذا كنت قد حضرت جلسة التسميع' })
  attended_recitation_call!: boolean;
}
