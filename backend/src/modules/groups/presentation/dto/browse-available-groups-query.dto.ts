import { IsIn, IsOptional } from 'class-validator';

export class BrowseAvailableGroupsQueryDto {
  @IsOptional()
  @IsIn(['Male', 'Female'])
  gender?: 'Male' | 'Female';
}
