import { IsOptional, IsString } from 'class-validator';

export class ListPendingJoinRequestsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  limit?: string | number;
}
