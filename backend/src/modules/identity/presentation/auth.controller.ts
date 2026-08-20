import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../../../shared';
import { RegisterDto } from '../application/register/register.dto';
import { RegisterResponseDto } from '../application/register/register-response.dto';
import { RegisterUseCase } from '../application/register/register.use-case';
import { LoginDto } from '../application/login/login.dto';
import { LoginResponseDto } from '../application/login/login-response.dto';
import { LoginUseCase } from '../application/login/login.use-case';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
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
}
