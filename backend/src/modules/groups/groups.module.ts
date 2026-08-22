import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GROUP_REPOSITORY } from './domain/group.repository.interface';
import { GroupTypeOrmEntity } from './infrastructure/group.typeorm-entity';
import { MembershipTypeOrmEntity } from './infrastructure/membership.typeorm-entity';
import { UserTypeOrmEntity } from '../identity/infrastructure/user.typeorm-entity';
import { GroupRepository } from './infrastructure/group.repository';
import { ListGroupsUseCase } from './application/list-groups/list-groups.use-case';
import { BrowseAvailableGroupsUseCase } from './application/browse-available-groups/browse-available-groups.use-case';
import { GroupsController } from './presentation/groups.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupTypeOrmEntity,
      MembershipTypeOrmEntity,
      UserTypeOrmEntity,
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
  ],
  exports: [GROUP_REPOSITORY, ListGroupsUseCase, BrowseAvailableGroupsUseCase],
})
export class GroupsModule {}
