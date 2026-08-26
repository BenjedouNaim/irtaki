import { Controller, Get, Header } from '@nestjs/common';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { ListSurahsUseCase } from '../application/list-surahs/list-surahs.use-case';
import { ListSurahsResponseDto } from '../application/list-surahs/list-surahs-response.dto';

@Controller('quran')
export class QuranController {
  constructor(private readonly listSurahsUseCase: ListSurahsUseCase) {}

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
}
