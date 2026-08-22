import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { USER_REPOSITORY } from './domain/user.repository.interface';
import { PASSWORD_HASHER } from './domain/password-hasher.interface';
import { MAILER } from './domain/mailer.interface';
import { UserTypeOrmEntity } from './infrastructure/user.typeorm-entity';
import { AuthTokenTypeOrmEntity } from './infrastructure/auth-token.typeorm-entity';
import { AuditEntryTypeOrmEntity } from './infrastructure/audit-entry.typeorm-entity';
import { UserRepository } from './infrastructure/user.repository';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { MailgunMailer } from './infrastructure/mailgun-mailer';
import { TokenService } from './application/token/token.service';
import { RegisterUseCase } from './application/register/register.use-case';
import { LoginUseCase } from './application/login/login.use-case';
import { RefreshUseCase } from './application/refresh/refresh.use-case';
import { LogoutUseCase } from './application/logout/logout.use-case';
import { RequestPasswordResetUseCase } from './application/password-reset/request-password-reset.use-case';
import { ConfirmPasswordResetUseCase } from './application/password-reset/confirm-password-reset.use-case';
import { GetMeUseCase } from './application/me/get-me.use-case';
import { UpdateProfileUseCase } from './application/me/update-profile.use-case';
import { ListUsersUseCase } from './application/list-users/list-users.use-case';
import { AuthController } from './presentation/auth.controller';
import { MeController } from './presentation/me.controller';
import { UsersController } from './presentation/users.controller';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      UserTypeOrmEntity,
      AuthTokenTypeOrmEntity,
      AuditEntryTypeOrmEntity,
    ]),
  ],
  controllers: [AuthController, MeController, UsersController],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },
    {
      provide: PASSWORD_HASHER,
      useClass: Argon2PasswordHasher,
    },
    {
      provide: MAILER,
      useClass: MailgunMailer,
    },
    UserRepository,
    Argon2PasswordHasher,
    MailgunMailer,
    TokenService,
    RegisterUseCase,
    LoginUseCase,
    RefreshUseCase,
    LogoutUseCase,
    RequestPasswordResetUseCase,
    ConfirmPasswordResetUseCase,
    GetMeUseCase,
    UpdateProfileUseCase,
    ListUsersUseCase,
  ],
  exports: [
    USER_REPOSITORY,
    PASSWORD_HASHER,
    MAILER,
    TokenService,
    RegisterUseCase,
    LoginUseCase,
    RefreshUseCase,
    LogoutUseCase,
    RequestPasswordResetUseCase,
    ConfirmPasswordResetUseCase,
    GetMeUseCase,
    UpdateProfileUseCase,
    ListUsersUseCase,
  ],
})
export class IdentityModule {}
