import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipTypeOrmEntity } from './infrastructure/membership.typeorm-entity';
import { MEMBERSHIP_REPOSITORY } from './domain/membership.repository.interface';
import { MembershipRepository } from './infrastructure/membership.repository';
import { GroupTypeOrmEntity } from '../groups/infrastructure/group.typeorm-entity';
import { GetOwnMembershipUseCase } from './application/get-own-membership/get-own-membership.use-case';
import { MembershipsController } from './presentation/memberships.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MembershipTypeOrmEntity, GroupTypeOrmEntity]),
  ],
  controllers: [MembershipsController],
  providers: [
    {
      provide: MEMBERSHIP_REPOSITORY,
      useClass: MembershipRepository,
    },
    MembershipRepository,
    GetOwnMembershipUseCase,
  ],
  exports: [
    MEMBERSHIP_REPOSITORY,
    MembershipRepository,
    GetOwnMembershipUseCase,
  ],
})
export class MembershipsModule {}
