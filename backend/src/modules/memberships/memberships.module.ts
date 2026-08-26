import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipTypeOrmEntity } from './infrastructure/membership.typeorm-entity';
import { MEMBERSHIP_REPOSITORY } from './domain/membership.repository.interface';
import { MembershipRepository } from './infrastructure/membership.repository';
import { GroupTypeOrmEntity } from '../groups/infrastructure/group.typeorm-entity';
import { GroupsModule } from '../groups/groups.module';
import { IdentityModule } from '../identity/identity.module';
import { GetOwnMembershipUseCase } from './application/get-own-membership/get-own-membership.use-case';
import { GetRosterUseCase } from './application/get-roster/get-roster.use-case';
import { TerminateMembershipUseCase } from './application/terminate-membership/terminate-membership.use-case';
import { MembershipsController } from './presentation/memberships.controller';
import { GroupMembershipsController } from './presentation/group-memberships.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MembershipTypeOrmEntity, GroupTypeOrmEntity]),
    GroupsModule,
    IdentityModule,
  ],
  controllers: [MembershipsController, GroupMembershipsController],
  providers: [
    {
      provide: MEMBERSHIP_REPOSITORY,
      useClass: MembershipRepository,
    },
    MembershipRepository,
    GetOwnMembershipUseCase,
    GetRosterUseCase,
    TerminateMembershipUseCase,
  ],
  exports: [
    MEMBERSHIP_REPOSITORY,
    MembershipRepository,
    GetOwnMembershipUseCase,
    GetRosterUseCase,
    TerminateMembershipUseCase,
  ],
})
export class MembershipsModule {}
