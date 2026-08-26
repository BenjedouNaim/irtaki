import { Controller, Get, Header } from '@nestjs/common';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { ListSurahsUseCase } from '../application/list-surahs/list-surahs.use-case';
import { ListSurahsResponseDto } from '../application/list-surahs/list-surahs-response.dto';
import { GetHizbBoundariesUseCase } from '../application/list-hizb-boundaries/get-hizb-boundaries.use-case';
import { ListHizbBoundariesResponseDto } from '../application/list-hizb-boundaries/list-hizb-boundaries-response.dto';

@Controller('quran')
export class QuranController {
  constructor(
    private readonly listSurahsUseCase: ListSurahsUseCase,
    private readonly getHizbBoundariesUseCase: GetHizbBoundariesUseCase,
  ) {}

  @Roles(
    UserRole.Admin,
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Student,
    UserRole.User,
  )
  @Header('Cache-Control', 'public, max-age=604800')
  @Get('surahs')
  async listSurahs(): Promise<ListSurahsResponseDto> {
    return this.listSurahsUseCase.execute();
  }

  @Roles(
    UserRole.Admin,
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Student,
    UserRole.User,
  )
  @Header('Cache-Control', 'public, max-age=604800')
  @Get('hizb-boundaries')
  async listHizbBoundaries(): Promise<ListHizbBoundariesResponseDto> {
    return this.getHizbBoundariesUseCase.execute();
  }
}
