import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipTypeOrmEntity } from './infrastructure/membership.typeorm-entity';
import { MEMBERSHIP_REPOSITORY } from './domain/membership.repository.interface';
import { MembershipRepository } from './infrastructure/membership.repository';

@Module({
  imports: [TypeOrmModule.forFeature([MembershipTypeOrmEntity])],
  providers: [
    {
      provide: MEMBERSHIP_REPOSITORY,
      useClass: MembershipRepository,
    },
    MembershipRepository,
  ],
  exports: [MEMBERSHIP_REPOSITORY, MembershipRepository],
})
export class MembershipsModule {}
