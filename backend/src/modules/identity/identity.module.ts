import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { USER_REPOSITORY } from './domain/user.repository.interface';
import { PASSWORD_HASHER } from './domain/password-hasher.interface';
import { UserTypeOrmEntity } from './infrastructure/user.typeorm-entity';
import { AuthTokenTypeOrmEntity } from './infrastructure/auth-token.typeorm-entity';
import { AuditEntryTypeOrmEntity } from './infrastructure/audit-entry.typeorm-entity';
import { UserRepository } from './infrastructure/user.repository';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { TokenService } from './application/token/token.service';
import { RegisterUseCase } from './application/register/register.use-case';
import { AuthController } from './presentation/auth.controller';

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
  controllers: [AuthController],
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },
    {
      provide: PASSWORD_HASHER,
      useClass: Argon2PasswordHasher,
    },
    UserRepository,
    Argon2PasswordHasher,
    TokenService,
    RegisterUseCase,
  ],
  exports: [USER_REPOSITORY, PASSWORD_HASHER, TokenService, RegisterUseCase],
})
export class IdentityModule {}
