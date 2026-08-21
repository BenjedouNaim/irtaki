import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../../../shared';
import { RegisterDto } from '../application/register/register.dto';
import { RegisterResponseDto } from '../application/register/register-response.dto';
import { RegisterUseCase } from '../application/register/register.use-case';
import { LoginDto } from '../application/login/login.dto';
import { LoginResponseDto } from '../application/login/login-response.dto';
import { LoginUseCase } from '../application/login/login.use-case';
import { RefreshDto } from '../application/refresh/refresh.dto';
import { RefreshResponseDto } from '../application/refresh/refresh-response.dto';
import { RefreshUseCase } from '../application/refresh/refresh.use-case';
import { LogoutDto } from '../application/logout/logout.dto';
import { LogoutUseCase } from '../application/logout/logout.use-case';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.registerUseCase.execute(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.loginUseCase.execute(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto): Promise<RefreshResponseDto> {
    return this.refreshUseCase.execute(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutDto): Promise<void> {
    return this.logoutUseCase.execute(dto);
  }
}
