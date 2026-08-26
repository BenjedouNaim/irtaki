import { IsOptional, IsString, Matches } from 'class-validator';

export class GetRosterQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  as_of?: string;
}
