import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GROUP_REPOSITORY } from './domain/group.repository.interface';
import { GroupTypeOrmEntity } from './infrastructure/group.typeorm-entity';
import { MembershipTypeOrmEntity } from './infrastructure/membership.typeorm-entity';
import { UserTypeOrmEntity } from '../identity/infrastructure/user.typeorm-entity';
import { AuditEntryTypeOrmEntity } from '../identity/infrastructure/audit-entry.typeorm-entity';
import { IdentityModule } from '../identity/identity.module';
import { GroupRepository } from './infrastructure/group.repository';
import { ListGroupsUseCase } from './application/list-groups/list-groups.use-case';
import { BrowseAvailableGroupsUseCase } from './application/browse-available-groups/browse-available-groups.use-case';
import { GroupDetailUseCase } from './application/group-detail/group-detail.use-case';
import { CreateGroupUseCase } from './application/create-group/create-group.use-case';
import { UpdateGroupNameUseCase } from './application/update-group-name/update-group-name.use-case';
import { GroupsController } from './presentation/groups.controller';

@Module({
  imports: [
    IdentityModule,
    TypeOrmModule.forFeature([
      GroupTypeOrmEntity,
      MembershipTypeOrmEntity,
      UserTypeOrmEntity,
      AuditEntryTypeOrmEntity,
    ]),
  ],
  controllers: [GroupsController],
  providers: [
    {
      provide: GROUP_REPOSITORY,
      useClass: GroupRepository,
    },
    GroupRepository,
    ListGroupsUseCase,
    BrowseAvailableGroupsUseCase,
    GroupDetailUseCase,
    CreateGroupUseCase,
    UpdateGroupNameUseCase,
  ],
  exports: [
    GROUP_REPOSITORY,
    ListGroupsUseCase,
    BrowseAvailableGroupsUseCase,
    GroupDetailUseCase,
    CreateGroupUseCase,
    UpdateGroupNameUseCase,
  ],
})
export class GroupsModule {}
